using System.Text.Json;
using ScTelemetry.Protobuf;

namespace ScTelemetry.Telemetry;

/// <summary>
/// The pump. When the game is running, it pulls a frame, decodes it to named JSON
/// and POSTs it to the configured URL every interval. When the game is not running
/// it idles cheaply. Every step is wrapped so nothing escapes to the UI.
/// </summary>
internal sealed class Worker : IDisposable
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private static readonly TimeSpan IdlePoll = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan SchemaRetry = TimeSpan.FromSeconds(30);

    private readonly AppConfig _cfg;
    private readonly GameClient _game;
    private readonly Uploader _uploader;

    private FrameDecoder? _decoder;
    private string _rootType = "";
    private DateTime _schemaRetryAt = DateTime.MinValue;

    private CancellationTokenSource? _cts;
    private Task? _loop;

    // status (read by the tray)
    public string Phase { get; private set; } = "starting";
    public DateTime? LastOkUtc { get; private set; }
    public string? LastError { get; private set; }
    public long Sent { get; private set; }

    public Worker(AppConfig cfg)
    {
        _cfg = cfg;
        _game = new GameClient(cfg.Source);
        _uploader = new Uploader(cfg.Url, cfg.UrlSslVerify, cfg.Token);
    }

    public void Start()
    {
        _cts = new CancellationTokenSource();
        _loop = Task.Run(() => RunAsync(_cts.Token));
    }

    private async Task RunAsync(CancellationToken ct)
    {
        var interval = TimeSpan.FromSeconds(_cfg.IntervalSeconds);
        while (!ct.IsCancellationRequested)
        {
            TimeSpan wait = interval;
            try
            {
                if (!GameProcess.IsRunning())
                {
                    Phase = "waiting for game";
                    wait = IdlePoll;
                }
                else if (!EnsureSchema())
                {
                    wait = interval;   // EnsureSchema itself backs off the heavy work
                }
                else
                {
                    string json = await BuildJsonAsync(ct);
                    await _uploader.PostAsync(json, ct);
                    LastOkUtc = DateTime.UtcNow;
                    LastError = null;
                    Sent++;
                    Phase = "streaming";
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception e)
            {
                LastError = Describe(e);
            }

            try { await Task.Delay(wait, ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>Pull one frame and return the JSON that would be uploaded.</summary>
    public async Task<string> BuildJsonAsync(CancellationToken ct)
    {
        if (_decoder == null && !EnsureSchema())
            throw new InvalidOperationException(LastError ?? "schema not loaded");

        byte[] frame = await _game.PullFrameAsync(ct);
        Dictionary<string, object?> decoded = _decoder!.Decode(frame, _rootType);
        var envelope = new Dictionary<string, object?>
        {
            ["capturedAt"] = DateTime.UtcNow.ToString("o"),
            ["source"] = _cfg.Source,
            ["telemetry"] = decoded,
        };
        return JsonSerializer.Serialize(envelope, JsonOpts);
    }

    /// <summary>Load the schema once; on failure, back off so we don't re-scan the exe each tick.</summary>
    private bool EnsureSchema()
    {
        if (_decoder != null) return true;
        if (DateTime.UtcNow < _schemaRetryAt) return false;
        try
        {
            Schema schema = AppCore.LoadSchema(_cfg);
            _decoder = new FrameDecoder(schema);
            _rootType = AppCore.RootType(schema);
            return true;
        }
        catch (Exception e)
        {
            Phase = "schema error";
            LastError = "schema: " + e.Message;
            _schemaRetryAt = DateTime.UtcNow + SchemaRetry;
            return false;
        }
    }

    private static string Describe(Exception e)
    {
        // Unwrap the common wrappers so the status line is readable.
        while (e.InnerException != null && (e is AggregateException || e is HttpRequestException))
            e = e.InnerException;
        return e.Message;
    }

    public void Dispose()
    {
        try { _cts?.Cancel(); } catch { }
        try { _loop?.Wait(TimeSpan.FromSeconds(3)); } catch { }
        _cts?.Dispose();
        _game.Dispose();
        _uploader.Dispose();
    }
}
