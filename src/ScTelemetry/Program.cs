using System.Runtime.InteropServices;
using System.Windows.Forms;
using ScTelemetry.Protobuf;
using ScTelemetry.Telemetry;

namespace ScTelemetry;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        // Console helpers for headless testing from a terminal.
        if (args.Contains("--once")) return Console_(once: true);
        if (args.Contains("--print")) return Console_(once: false);

        ApplicationConfiguration.Initialize();
        using var app = new TrayApp();
        Application.Run();
        return 0;
    }

    /// <summary>--once prints one decoded frame; --print loops. For testing without the tray.</summary>
    private static int Console_(bool once)
    {
        AttachConsole(unchecked((uint)-1));   // ATTACH_PARENT_PROCESS
        try
        {
            if (AppCore.EnsureConfig())
            {
                Console.WriteLine($"Created {AppCore.ConfigPath} — set 'url' and run again.");
                return 1;
            }
            AppConfig cfg = AppCore.LoadConfig();
            Console.Error.WriteLine("loading schema from the game exe…");
            Schema schema = AppCore.LoadSchema(cfg);
            Console.Error.WriteLine($"schema: {schema.Messages.Count} messages, {schema.Enums.Count} enums");
            using var worker = new Worker(cfg, schema, AppCore.RootType(schema));

            do
            {
                try
                {
                    string json = worker.BuildJsonAsync(CancellationToken.None).GetAwaiter().GetResult();
                    Console.WriteLine(json);
                }
                catch (Exception e)
                {
                    Console.Error.WriteLine("pull failed: " + e.Message);
                    if (once) return 2;
                }
                if (!once) Thread.Sleep((int)(cfg.IntervalSeconds * 1000));
            } while (!once);
            return 0;
        }
        catch (Exception e)
        {
            Console.Error.WriteLine("error: " + e.Message);
            return 2;
        }
    }

    [DllImport("kernel32.dll")]
    private static extern bool AttachConsole(uint processId);
}
