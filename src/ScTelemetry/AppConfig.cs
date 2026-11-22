using System.Globalization;
using System.Text;

namespace ScTelemetry;

/// <summary>
/// The tool's settings. Backed by a simple INI file, editable from the Settings
/// window or by hand. Keys: interval, url, token, url_ssl_verify, source, exe.
/// </summary>
internal sealed class AppConfig
{
    public double IntervalSeconds { get; set; } = 1.0;
    public string Url { get; set; } = "https://sctelemetry.dodoslav.eu/telemetry";
    public string Token { get; set; } = "";                 // bearer token sent on upload
    public bool UrlSslVerify { get; set; } = true;
    public string Source { get; set; } = "127.0.0.1:50051";
    public string ExePath { get; set; } = "";               // empty = auto-detect

    public static AppConfig Default() => new();

    public static AppConfig Load(string path)
    {
        var ini = Ini.Parse(File.ReadAllLines(path));
        var cfg = new AppConfig();

        if (ini.TryGetValue("interval", out var interval) &&
            double.TryParse(interval, NumberStyles.Float, CultureInfo.InvariantCulture, out var secs) && secs > 0)
            cfg.IntervalSeconds = secs;

        if (ini.TryGetValue("url", out var url)) cfg.Url = url.Trim();
        if (ini.TryGetValue("token", out var token)) cfg.Token = token.Trim();
        if (ini.TryGetValue("url_ssl_verify", out var verify)) cfg.UrlSslVerify = ParseBool(verify, true);
        if (ini.TryGetValue("source", out var source) && source.Trim().Length > 0) cfg.Source = source.Trim();
        if (ini.TryGetValue("exe", out var exe)) cfg.ExePath = exe.Trim();

        return cfg;
    }

    public void Save(string path)
    {
        var sb = new StringBuilder();
        sb.AppendLine("# StarCitizen_Telemetry configuration");
        sb.AppendLine("# Edited by the Settings window, but plain text if you prefer.");
        sb.AppendLine();
        sb.AppendLine("# How often to pull data from the game, in seconds (decimals allowed).");
        sb.AppendLine($"interval = {IntervalSeconds.ToString(CultureInfo.InvariantCulture)}");
        sb.AppendLine();
        sb.AppendLine("# HTTP endpoint the decoded JSON is POSTed to.");
        sb.AppendLine($"url = {Url}");
        sb.AppendLine();
        sb.AppendLine("# Bearer token sent as 'Authorization: Bearer <token>' (leave empty for none).");
        sb.AppendLine($"token = {Token}");
        sb.AppendLine();
        sb.AppendLine("# Verify the endpoint's TLS certificate (true/false).");
        sb.AppendLine($"url_ssl_verify = {(UrlSslVerify ? "true" : "false")}");
        sb.AppendLine();
        sb.AppendLine("# The game's local gRPC server (ip:port).");
        sb.AppendLine($"source = {Source}");
        sb.AppendLine();
        sb.AppendLine("# Optional path to StarCitizen.exe (empty = auto-detect).");
        sb.AppendLine($"exe = {ExePath}");

        File.WriteAllText(path, sb.ToString());
    }

    private static bool ParseBool(string s, bool fallback)
    {
        s = s.Trim().ToLowerInvariant();
        return s switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback,
        };
    }
}
