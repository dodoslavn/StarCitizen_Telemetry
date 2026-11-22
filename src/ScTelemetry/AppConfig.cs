using System.Globalization;

namespace ScTelemetry;

/// <summary>
/// Settings read from the INI file. Keys (all under no section, or any section —
/// sections are ignored):
///   interval        pull period in seconds (default 1)
///   url             HTTP endpoint the JSON is POSTed to
///   url_ssl_verify  true/false, verify the endpoint's TLS certificate (default true)
///   source          ip:port of the game's gRPC server (default 127.0.0.1:50051)
///   exe             optional path to StarCitizen.exe (auto-detected if empty)
/// </summary>
internal sealed class AppConfig
{
    public double IntervalSeconds { get; private set; } = 1.0;
    public string Url { get; private set; } = "";
    public bool UrlSslVerify { get; private set; } = true;
    public string Source { get; private set; } = "127.0.0.1:50051";
    public string ExePath { get; private set; } = "";

    public static AppConfig Load(string path)
    {
        var ini = Ini.Parse(File.ReadAllLines(path));
        var cfg = new AppConfig();

        if (ini.TryGetValue("interval", out var interval) &&
            double.TryParse(interval, NumberStyles.Float, CultureInfo.InvariantCulture, out var secs) && secs > 0)
            cfg.IntervalSeconds = secs;

        if (ini.TryGetValue("url", out var url)) cfg.Url = url.Trim();
        if (ini.TryGetValue("url_ssl_verify", out var verify)) cfg.UrlSslVerify = ParseBool(verify, true);
        if (ini.TryGetValue("source", out var source) && source.Trim().Length > 0) cfg.Source = source.Trim();
        if (ini.TryGetValue("exe", out var exe)) cfg.ExePath = exe.Trim();

        if (cfg.Url.Length == 0)
            throw new InvalidOperationException("config: 'url' is required");

        return cfg;
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
