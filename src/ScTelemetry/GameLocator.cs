using System.Diagnostics;

namespace ScTelemetry;

/// <summary>Finds StarCitizen.exe when the config doesn't pin a path.</summary>
internal static class GameLocator
{
    private static readonly string[] Channels = { "LIVE", "PTU", "EPTU", "TECH-PREVIEW", "HOTFIX" };

    private static readonly string[] CommonRoots =
    {
        @"{0}:\Program Files\Roberts Space Industries\StarCitizen",
        @"{0}:\Roberts Space Industries\StarCitizen",
        @"{0}:\Games\Roberts Space Industries\StarCitizen",
        @"{0}:\StarCitizen",
        @"{0}:\Games\StarCitizen",
    };

    /// <summary>Running game first, then the usual install folders on every drive.</summary>
    public static string? Find()
    {
        string? running = FromRunningProcess();
        if (running != null) return running;

        foreach (char drive in "CDEFGHIJKLMNOPQRSTUVWXYZ")
            foreach (var pattern in CommonRoots)
            {
                string root = string.Format(pattern, drive);
                foreach (var channel in Channels)
                {
                    string exe = Path.Combine(root, channel, "Bin64", "StarCitizen.exe");
                    if (File.Exists(exe)) return exe;
                }
            }
        return null;
    }

    private static string? FromRunningProcess()
    {
        try
        {
            foreach (var p in Process.GetProcessesByName("StarCitizen"))
            {
                try
                {
                    string? path = p.MainModule?.FileName;
                    if (path != null && File.Exists(path)) return path;
                }
                catch { /* access denied for some processes; ignore */ }
            }
        }
        catch { /* process enumeration can fail; fall back to disk scan */ }
        return null;
    }
}
