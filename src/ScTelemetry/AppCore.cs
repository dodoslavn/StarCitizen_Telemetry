using ScTelemetry.Protobuf;

namespace ScTelemetry;

/// <summary>Shared bootstrap: locate config, load the schema, prepare a worker.</summary>
internal static class AppCore
{
    public static string ConfigPath => Path.Combine(AppContext.BaseDirectory, "config.ini");

    public static string CacheDir => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ScTelemetry");

    /// <summary>Write a starter config.ini next to the exe if none exists. Returns true if created.</summary>
    public static bool EnsureConfig()
    {
        if (File.Exists(ConfigPath)) return false;
        File.WriteAllText(ConfigPath, DefaultConfig);
        return true;
    }

    public static AppConfig LoadConfig() => AppConfig.Load(ConfigPath);

    /// <summary>Resolve the game exe (config override or auto-detect).</summary>
    public static string ResolveExe(AppConfig cfg)
    {
        if (cfg.ExePath.Length > 0)
        {
            if (!File.Exists(cfg.ExePath))
                throw new FileNotFoundException($"config 'exe' path not found: {cfg.ExePath}");
            return cfg.ExePath;
        }
        return GameLocator.Find()
            ?? throw new FileNotFoundException(
                "Could not find StarCitizen.exe. Set 'exe' in config.ini to its full path.");
    }

    public static Schema LoadSchema(AppConfig cfg)
    {
        string exe = ResolveExe(cfg);
        return SchemaStore.Load(exe, CacheDir);
    }

    public static string RootType(Schema schema) =>
        schema.FindMessageEndingWith("TelemetryStreamResponse")
        ?? ".sc.game.telemetry.v1.TelemetryStreamResponse";

    private const string DefaultConfig =
        """
        # StarCitizen_Telemetry configuration

        # How often to pull data from the game, in seconds (decimals allowed).
        interval = 1

        # HTTP endpoint the decoded JSON is POSTed to.
        url = https://example.com/telemetry

        # Verify the endpoint's TLS certificate (true/false).
        url_ssl_verify = true

        # The game's local gRPC server (ip:port). Normally the default.
        source = 127.0.0.1:50051

        # Optional: full path to StarCitizen.exe. Leave empty to auto-detect.
        # exe = C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Bin64\StarCitizen.exe
        exe =

        """;
}
