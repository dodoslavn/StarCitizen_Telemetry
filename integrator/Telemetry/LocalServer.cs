using System.Net;
using System.Text;
using System.Text.Json;

namespace Integrator.Telemetry;

/// <summary>
/// A tiny no-auth HTTP server that exposes the latest decoded frame as JSON.
/// GET any path → the latest frame; add <c>?path=a.b.c</c> for a single value
/// (missing → "-"). Pure BCL (HttpListener). Bind address and port are configurable.
/// </summary>
internal sealed class LocalServer : IDisposable
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Func<Dictionary<string, object?>?> _provider;
    private HttpListener? _listener;
    private Thread? _thread;

    public string? Error { get; private set; }
    public string Prefix { get; private set; } = "";
    public bool Running => _listener?.IsListening == true;

    public LocalServer(Func<Dictionary<string, object?>?> provider) => _provider = provider;

    public void Start(string bind, int port)
    {
        Stop();
        Error = null;
        try
        {
            string host = string.IsNullOrWhiteSpace(bind) || bind == "0.0.0.0" || bind == "*" ? "+" : bind;
            Prefix = $"http://{host}:{port}/";
            _listener = new HttpListener();
            _listener.Prefixes.Add(Prefix);
            _listener.Start();
            _thread = new Thread(Loop) { IsBackground = true, Name = "local-http" };
            _thread.Start();
        }
        catch (Exception e)
        {
            Error = e.Message;
            _listener = null;
        }
    }

    private void Loop()
    {
        var listener = _listener;
        while (listener != null && listener.IsListening)
        {
            HttpListenerContext ctx;
            try { ctx = listener.GetContext(); }
            catch { break; }
            try { Handle(ctx); } catch { /* never let one request kill the loop */ }
        }
    }

    private void Handle(HttpListenerContext ctx)
    {
        var res = ctx.Response;
        res.AddHeader("Access-Control-Allow-Origin", "*");
        res.ContentType = "application/json; charset=utf-8";

        Dictionary<string, object?>? frame = _provider();
        string? path = ctx.Request.QueryString["path"];
        object? payload = frame == null ? null
            : string.IsNullOrEmpty(path) ? frame
            : JsonPath.Get(frame, path);

        byte[] bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload, JsonOpts));
        res.StatusCode = 200;
        res.ContentLength64 = bytes.Length;
        res.OutputStream.Write(bytes, 0, bytes.Length);
        res.OutputStream.Close();
    }

    public void Stop()
    {
        try { _listener?.Stop(); _listener?.Close(); } catch { }
        _listener = null;
    }

    public void Dispose() => Stop();
}
