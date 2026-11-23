using System.Net.Http.Headers;
using System.Text;

namespace Integrator.Telemetry;

/// <summary>POSTs the decoded JSON to the configured URL.</summary>
internal sealed class Uploader : IDisposable
{
    private readonly string _url;
    private readonly HttpClient _http;

    public Uploader(string url, bool sslVerify, string token)
    {
        _url = url;
        var handler = new HttpClientHandler();
        if (!sslVerify)
            handler.ServerCertificateCustomValidationCallback =
                HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
        _http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(30) };
        if (!string.IsNullOrWhiteSpace(token))
            _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }

    public async Task PostAsync(string json, CancellationToken ct)
    {
        using var content = new StringContent(json, Encoding.UTF8);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        using var resp = await _http.PostAsync(_url, content, ct);
        resp.EnsureSuccessStatusCode();
    }

    public void Dispose() => _http.Dispose();
}
