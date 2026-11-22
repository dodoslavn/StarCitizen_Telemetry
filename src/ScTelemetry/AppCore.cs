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
        AppConfig.Default().Save(ConfigPath);
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
}
