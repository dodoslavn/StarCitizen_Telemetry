using System.Drawing;
using System.Windows.Forms;
using ScTelemetry.Protobuf;
using ScTelemetry.Telemetry;

namespace ScTelemetry;

/// <summary>System-tray front end: owns the worker and shows status.</summary>
internal sealed class TrayApp : IDisposable
{
    private readonly NotifyIcon _tray;
    private readonly System.Windows.Forms.Timer _statusTimer;
    private readonly ToolStripMenuItem _statusItem;
    private Worker? _worker;
    private string _state = "starting…";

    public TrayApp()
    {
        _statusItem = new ToolStripMenuItem("starting…") { Enabled = false };

        var menu = new ContextMenuStrip();
        menu.Items.Add(_statusItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Pull one frame (test)", null, (_, _) => PullOnce());
        menu.Items.Add("Open config", null, (_, _) => OpenConfig());
        menu.Items.Add("Reload config", null, (_, _) => Reload());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => Application.Exit());

        _tray = new NotifyIcon
        {
            Icon = MakeIcon(),
            Text = "StarCitizen Telemetry",
            Visible = true,
            ContextMenuStrip = menu,
        };

        _statusTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        _statusTimer.Tick += (_, _) => RefreshStatus();
        _statusTimer.Start();

        Start();
    }

    private void Start()
    {
        try
        {
            if (AppCore.EnsureConfig())
            {
                Info($"Created a config file:\n{AppCore.ConfigPath}\nEdit 'url' then Reload.");
                _state = "edit config.ini (set url), then Reload";
                return;
            }

            _state = "loading schema…";
            RefreshStatus();

            // Schema extraction can read a large exe; do it off the UI thread.
            Task.Run(() =>
            {
                try
                {
                    AppConfig cfg = AppCore.LoadConfig();
                    Schema schema = AppCore.LoadSchema(cfg);
                    string root = AppCore.RootType(schema);
                    var worker = new Worker(cfg, schema, root);
                    worker.Start();
                    _worker = worker;
                    _state = "running";
                }
                catch (Exception e)
                {
                    _state = "error";
                    Error(e.Message);
                }
            });
        }
        catch (Exception e)
        {
            _state = "error";
            Error(e.Message);
        }
    }

    private void Reload()
    {
        _worker?.Dispose();
        _worker = null;
        _state = "reloading…";
        Start();
    }

    private void PullOnce()
    {
        Worker? w = _worker;
        if (w == null) { Info("Not running yet."); return; }
        Task.Run(async () =>
        {
            try
            {
                string json = await w.BuildJsonAsync(CancellationToken.None);
                string path = Path.Combine(Path.GetTempPath(), "sctelemetry_frame.json");
                await File.WriteAllTextAsync(path, json);
                OpenPath(path);
            }
            catch (Exception e) { Error(e.Message); }
        });
    }

    private void OpenConfig() => OpenPath(AppCore.ConfigPath);

    private void RefreshStatus()
    {
        Worker? w = _worker;
        string text;
        if (w == null)
        {
            text = _state;
        }
        else if (w.LastError != null)
        {
            text = $"error: {Trim(w.LastError, 60)}";
        }
        else if (w.LastOkUtc is { } ok)
        {
            int ago = (int)(DateTime.UtcNow - ok).TotalSeconds;
            text = $"ok · {w.Sent} sent · {ago}s ago";
        }
        else
        {
            text = _state;
        }

        _statusItem.Text = text;
        _tray.Text = Trim("SC Telemetry · " + text, 63);   // NotifyIcon.Text max 63 chars
    }

    private static Icon MakeIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using var bg = new SolidBrush(Color.FromArgb(20, 24, 32));
            g.FillEllipse(bg, 0, 0, 31, 31);
            using var pen = new Pen(Color.Gold, 2);
            g.DrawEllipse(pen, 1, 1, 29, 29);
            using var font = new Font("Segoe UI", 12, FontStyle.Bold, GraphicsUnit.Pixel);
            using var fg = new SolidBrush(Color.Gold);
            var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("SC", font, fg, new RectangleF(0, 0, 32, 32), fmt);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    private static string Trim(string s, int max) => s.Length <= max ? s : s[..max];

    private void Info(string msg) =>
        _tray.ShowBalloonTip(5000, "StarCitizen Telemetry", msg, ToolTipIcon.Info);

    private void Error(string msg) =>
        _tray.ShowBalloonTip(5000, "StarCitizen Telemetry", msg, ToolTipIcon.Error);

    private static void OpenPath(string path)
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true });
        }
        catch { /* ignore */ }
    }

    public void Dispose()
    {
        _statusTimer.Dispose();
        _worker?.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
    }
}
