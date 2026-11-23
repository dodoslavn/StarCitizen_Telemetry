using System.Diagnostics;

namespace Integrator.Telemetry;

/// <summary>Cheap check for whether Star Citizen is running.</summary>
internal static class GameProcess
{
    public static bool IsRunning()
    {
        Process[] procs = Process.GetProcessesByName("StarCitizen");
        try { return procs.Length > 0; }
        finally { foreach (var p in procs) p.Dispose(); }
    }
}
