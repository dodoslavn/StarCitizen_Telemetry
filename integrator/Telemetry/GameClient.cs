using System.Net;

namespace Integrator.Telemetry;

/// <summary>
/// Pulls a single telemetry frame from the game's local gRPC server over cleartext
/// HTTP/2, using nothing but HttpClient. gRPC is just HTTP/2 POST with a
/// length-prefixed protobuf body, so we frame the request and parse the response by hand.
/// </summary>
internal sealed class GameClient : IDisposable
{
    private const string Service = "sc.game.telemetry.v1.GameTelemetryService";
    private const string Method = "TelemetryStream";

    private readonly string _url;
    private readonly HttpClient _http;

    public GameClient(string source)
    {
        // Allow HTTP/2 without TLS (the game server is plain h2c on loopback).
        AppContext.SetSwitch("System.Net.Http.SocketsHttpHandler.Http2UnencryptedSupport", true);
        _url = $"http://{source}/{Service}/{Method}";
        _http = new HttpClient { DefaultRequestVersion = HttpVersion.Version20 };
    }

    /// <summary>Open the stream, read the first frame, return its protobuf bytes.</summary>
    public async Task<byte[]> PullFrameAsync(CancellationToken ct)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, _url)
        {
            Version = HttpVersion.Version20,
            VersionPolicy = HttpVersionPolicy.RequestVersionExact,
            Content = new ByteArrayContent(new byte[5]),   // empty gRPC-framed request
        };
        req.Content.Headers.TryAddWithoutValidation("Content-Type", "application/grpc");
        req.Headers.TryAddWithoutValidation("TE", "trailers");

        using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();
        await using var stream = await resp.Content.ReadAsStreamAsync(ct);

        var header = new byte[5];
        if (!await ReadExactAsync(stream, header, 5, ct))
            throw new IOException("No telemetry frame received — are you loaded into the game (not the menu)?");

        int len = (header[1] << 24) | (header[2] << 16) | (header[3] << 8) | header[4];
        var msg = new byte[len];
        if (len > 0 && !await ReadExactAsync(stream, msg, len, ct))
            throw new IOException("Telemetry frame was truncated.");
        return msg;
    }

    private static async Task<bool> ReadExactAsync(Stream s, byte[] buf, int n, CancellationToken ct)
    {
        int off = 0;
        while (off < n)
        {
            int r = await s.ReadAsync(buf.AsMemory(off, n - off), ct);
            if (r == 0) return false;
            off += r;
        }
        return true;
    }

    public void Dispose() => _http.Dispose();
}
