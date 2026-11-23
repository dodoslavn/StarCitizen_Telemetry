using System.Drawing;
using System.Windows.Forms;
using ScTelemetry.Telemetry;

namespace ScTelemetry;

/// <summary>Owns the config, the worker and the window; shows a status-coloured tray icon.</summary>
internal sealed class TrayApp : IDisposable
{
    private readonly NotifyIcon _tray;
    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 1000 };
    private AppConfig _cfg;
    private Worker? _worker;
    private MainForm? _window;

    public bool Exiting { get; private set; }
    public Worker? CurrentWorker => _worker;

    public TrayApp()
    {
        if (!File.Exists(AppCore.ConfigPath)) AppCore.EnsureConfig();
        try { _cfg = AppCore.LoadConfig(); } catch { _cfg = AppConfig.Default(); }

        var menu = new ContextMenuStrip();
        menu.Items.Add("Show window", null, (_, _) => ShowWindow());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => ExitApp());

        _tray = new NotifyIcon { Text = "SCTelemetry", Visible = true, ContextMenuStrip = menu };
        _tray.DoubleClick += (_, _) => ShowWindow();

        StartWorker(paused: false);
        UpdateIcon();

        _timer.Tick += (_, _) => UpdateIcon();
        _timer.Start();

        ShowWindow();   // show on first launch
    }

    private void StartWorker(bool paused)
    {
        _worker?.Dispose();
        _worker = new Worker(_cfg);
        _worker.Start(paused);
    }

    public void ApplyConfig(AppConfig cfg)
    {
        bool wasPaused = _worker?.Paused ?? false;
        _cfg = cfg;
        try { cfg.Save(AppCore.ConfigPath); } catch { }
        StartWorker(wasPaused);
    }

    public void ToggleRun()
    {
        if (_worker == null) { StartWorker(false); return; }
        if (_worker.Paused) _worker.Resume(); else _worker.Pause();
    }

    private void ShowWindow()
    {
        if (_window == null || _window.IsDisposed)
            _window = new MainForm(this, _cfg);
        _window.Show();
        _window.WindowState = FormWindowState.Normal;
        _window.Activate();
    }

    public void UpdateIcon()
    {
        _tray.Icon = IconFactory.Make(StatusColor());
        _tray.Text = Trim("SCTelemetry · " + StatusText(), 63);
    }

    private Color StatusColor()
    {
        var w = _worker;
        if (string.IsNullOrWhiteSpace(_cfg.Url) || w == null || w.Paused) return Theme.Orange;  // not configured / stopped
        if (!w.GameRunning) return Theme.Grey;                                                   // no game
        if (w.LastOkUtc is { } ok && (DateTime.UtcNow - ok).TotalSeconds < 15) return Theme.Green; // uploading
        return Theme.Red;                                                                        // game up but telemetry/upload issue
    }

    private string StatusText()
    {
        var w = _worker;
        if (w == null) return "stopped";
        if (w.Paused) return "stopped";
        if (!w.GameRunning) return "waiting for game";
        if (w.LastError != null) return "error: " + Trim(w.LastError, 40);
        if (w.LastOkUtc is { } ok) return $"uploading · {w.Sent} sent · {(int)(DateTime.UtcNow - ok).TotalSeconds}s ago";
        return w.Phase;
    }

    private void ExitApp()
    {
        Exiting = true;
        Application.Exit();
    }

    private static string Trim(string s, int max) => s.Length <= max ? s : s[..max];

    public void Dispose()
    {
        _timer.Dispose();
        _worker?.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
    }
}
