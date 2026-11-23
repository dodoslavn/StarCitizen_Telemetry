namespace Integrator;

/// <summary>Best-effort error log so swallowed exceptions can still be diagnosed.</summary>
internal static class Log
{
    private static readonly string Path = System.IO.Path.Combine(AppCore.CacheDir, "error.log");

    public static void Write(string where, Exception? e)
    {
        if (e == null) return;
        try
        {
            Directory.CreateDirectory(AppCore.CacheDir);
            File.AppendAllText(Path, $"{DateTime.Now:o} [{where}] {e}\n");
        }
        catch { /* logging must never throw */ }
    }
}
