using System.Net.Http.Headers;
using System.Text.Json;

namespace Integrator.Telemetry;

internal sealed class TestResult
{
    public bool ServerUp;
    public string Server = "";
    public bool? CredsOk;        // null = not tested (no token)
    public string Creds = "";
}

/// <summary>Checks that the upload server is reachable (via its dynamic /api/ping)
/// and, if a token is given, that the credentials are accepted.</summary>
internal static class ServerTester
{
    public static async Task<TestResult> RunAsync(string url, bool sslVerify, string? token, CancellationToken ct)
    {
        var r = new TestResult();
        var handler = new HttpClientHandler();
        if (!sslVerify) handler.ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
        using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(10) };

        // 1) is the server up? derive the ping URL (replace the last path segment with "ping")
        try
        {
            var uri = new Uri(url);
            var segs = uri.AbsolutePath.TrimEnd('/').Split('/');
            if (segs.Length > 0) segs[^1] = "ping";
            string pingUrl = uri.GetLeftPart(UriPartial.Authority) + string.Join('/', segs);
            using var resp = await http.GetAsync(pingUrl, ct);
            string body = await resp.Content.ReadAsStringAsync(ct);
            if (resp.IsSuccessStatusCode && body.Contains("\"nonce\""))
            {
                string? nonce = null, app = null;
                try { using var d = JsonDocument.Parse(body); nonce = d.RootElement.GetProperty("nonce").GetString(); app = d.RootElement.TryGetProperty("app", out var a) ? a.GetString() : null; } catch { }
                r.ServerUp = true;
                r.Server = $"up — {app ?? "server"} responded (nonce {nonce})";
            }
            else
            {
                r.ServerUp = true;
                r.Server = $"reachable (HTTP {(int)resp.StatusCode}), but no SCTelemetry /api/ping";
            }
        }
        catch (Exception e)
        {
            r.ServerUp = false;
            r.Server = "unreachable: " + e.Message;
        }

        // 2) are the credentials valid? GET the upload URL with the bearer token
        if (!string.IsNullOrWhiteSpace(token))
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                using var resp = await http.SendAsync(req, ct);
                if ((int)resp.StatusCode == 200) { r.CredsOk = true; r.Creds = "accepted"; }
                else if ((int)resp.StatusCode == 401) { r.CredsOk = false; r.Creds = "rejected (401)"; }
                else { r.CredsOk = null; r.Creds = $"unexpected HTTP {(int)resp.StatusCode}"; }
            }
            catch (Exception e)
            {
                r.CredsOk = false;
                r.Creds = "error: " + e.Message;
            }
        }
        return r;
    }
}
