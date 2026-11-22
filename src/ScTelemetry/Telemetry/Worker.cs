using System.Text.Json;
using ScTelemetry.Protobuf;

namespace ScTelemetry.Telemetry;

/// <summary>
/// The pump: every interval, pull a frame from the game, decode it to named JSON
/// and POST it to the configured URL. Exposes a small status snapshot for the tray.
/// </summary>
internal sealed class Worker : IDisposable
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly AppConfig _cfg;
    private readonly FrameDecoder _decoder;
    private readonly string _rootType;
    private readonly GameClient _game;
    private readonly Uploader _uploader;

    private CancellationTokenSource? _cts;
    private Task? _loop;

    // status (read by the tray)
    public DateTime? LastOkUtc { get; private set; }
    public DateTime? LastTryUtc { get; private set; }
    public string? LastError { get; private set; }
    public long Sent { get; private set; }

    public Worker(AppConfig cfg, Schema schema, string rootType)
    {
        _cfg = cfg;
        _decoder = new FrameDecoder(schema);
        _rootType = rootType;
        _game = new GameClient(cfg.Source);
        _uploader = new Uploader(cfg.Url, cfg.UrlSslVerify);
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
            LastTryUtc = DateTime.UtcNow;
            try
            {
                string json = await BuildJsonAsync(ct);
                await _uploader.PostAsync(json, ct);
                LastOkUtc = DateTime.UtcNow;
                LastError = null;
                Sent++;
            }
            catch (OperationCanceledException) { break; }
            catch (Exception e)
            {
                LastError = e.Message;
            }

            try { await Task.Delay(interval, ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>Pull one frame and return the JSON that would be uploaded.</summary>
    public async Task<string> BuildJsonAsync(CancellationToken ct)
    {
        byte[] frame = await _game.PullFrameAsync(ct);
        Dictionary<string, object?> decoded = _decoder.Decode(frame, _rootType);
        var envelope = new Dictionary<string, object?>
        {
            ["capturedAt"] = DateTime.UtcNow.ToString("o"),
            ["source"] = _cfg.Source,
            ["telemetry"] = decoded,
        };
        return JsonSerializer.Serialize(envelope, JsonOpts);
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
