using System.Drawing;
using System.Globalization;
using System.Windows.Forms;
using ScTelemetry.Telemetry;

namespace ScTelemetry;

/// <summary>The status + settings window.</summary>
internal sealed class MainForm : Form
{
    private readonly TrayApp _tray;

    // status indicators
    private readonly Label _dotGame = Dot(), _dotTele = Dot(), _dotSchema = Dot(), _dotUpload = Dot();
    private readonly Label _lblGame = new(), _lblTele = new(), _lblSchema = new(), _lblUpload = new();

    // settings
    private readonly TextBox _url = new() { Width = 340 };
    private readonly CheckBox _ssl = new() { Text = "Verify TLS certificate", AutoSize = true };
    private readonly ComboBox _auth = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 110 };
    private readonly TextBox _token = new() { Width = 340 };
    private readonly TextBox _source = new() { Width = 170 };
    private readonly TextBox _interval = new() { Width = 70 };
    private readonly Label _testResult = new() { AutoSize = true, MaximumSize = new Size(480, 0) };

    // controls
    private readonly Button _startStop = new() { Width = 120, Height = 30 };
    private readonly Label _lastUpload = new() { AutoSize = true };

    private readonly System.Windows.Forms.Timer _timer = new() { Interval = 1000 };

    public MainForm(TrayApp tray, AppConfig cfg)
    {
        _tray = tray;
        Text = "SCTelemetry";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        ClientSize = new Size(560, 640);
        BackColor = Theme.Bg;

        _auth.Items.AddRange(new object[] { "None", "Bearer" });

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, Padding = new Padding(14), BackColor = Theme.Bg, AutoScroll = true };
        root.Controls.Add(Header());
        root.Controls.Add(StatusCard());
        root.Controls.Add(SettingsCard());
        root.Controls.Add(ControlsCard());
        root.Controls.Add(Footer());
        Controls.Add(root);

        LoadFrom(cfg);
        Theme.Apply(this);
        StyleAccents();

        _timer.Tick += (_, _) => Refresh_();
        _timer.Start();
        Refresh_();
    }

    // ---- sections ----

    private Control Header()
    {
        var l = new Label { Text = "SCTELEMETRY", AutoSize = true, ForeColor = Theme.Accent, Font = new Font("Segoe UI", 15, FontStyle.Bold), Margin = new Padding(2, 0, 0, 2) };
        var sub = new Label { Text = "Telemetry collector for Star Citizen", AutoSize = true, ForeColor = Theme.Muted, Margin = new Padding(3, 0, 0, 10) };
        var p = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, Dock = DockStyle.Top, WrapContents = false };
        p.Controls.Add(l); p.Controls.Add(sub);
        return p;
    }

    private Control StatusCard()
    {
        var g = Grid(2);
        AddStatus(g, _dotGame, _lblGame, "Game running");
        AddStatus(g, _dotTele, _lblTele, "Game telemetry (gRPC)");
        AddStatus(g, _dotSchema, _lblSchema, "Telemetry metadata");
        AddStatus(g, _dotUpload, _lblUpload, "Upload endpoint");
        return Card("Status", g);
    }

    private Control SettingsCard()
    {
        var g = Grid(2);
        Row(g, "Upload URL", _url);
        Row(g, "", _ssl);
        Row(g, "Authorization", _auth);
        Row(g, "Token", _token);
        Row(g, "Game source", _source);
        Row(g, "Interval (s)", _interval);

        var test = new Button { Text = "Test server + credentials", Width = 200, Height = 28 };
        test.Click += async (_, _) => await OnTest();
        var save = new Button { Text = "Save", Width = 90, Height = 28 };
        save.Click += (_, _) => OnSave();
        var buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill };
        buttons.Controls.Add(save); buttons.Controls.Add(test);
        Row(g, "", buttons);
        Row(g, "", _testResult);

        _auth.SelectedIndexChanged += (_, _) => _token.Enabled = _auth.SelectedIndex == 1;
        return Card("Settings", g);
    }

    private Control ControlsCard()
    {
        _startStop.Click += (_, _) => { _tray.ToggleRun(); Refresh_(); };
        var data = new Button { Text = "Show latest data", Width = 150, Height = 30 };
        data.Click += async (_, _) => await OnShowData();

        var row = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Top };
        row.Controls.Add(_startStop);
        row.Controls.Add(data);

        var wrap = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, Dock = DockStyle.Fill, WrapContents = false };
        wrap.Controls.Add(row);
        wrap.Controls.Add(_lastUpload);
        return Card("Collection", wrap);
    }

    private Control Footer()
    {
        var link = new LinkLabel { Text = AppCore.Repo, AutoSize = true };
        link.LinkClicked += (_, _) => OpenUrl(AppCore.Repo);
        var ver = new Label { Text = $"v{AppCore.Version}", AutoSize = true, ForeColor = Theme.Muted };
        var p = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Top, Margin = new Padding(2, 12, 0, 0) };
        p.Controls.Add(ver);
        p.Controls.Add(new Label { Text = " · ", AutoSize = true, ForeColor = Theme.Muted });
        p.Controls.Add(link);
        return p;
    }

    // ---- helpers ----

    private static Label Dot() => new() { Text = "●", AutoSize = true, Font = new Font("Segoe UI", 11), ForeColor = Theme.Grey, Margin = new Padding(0, 3, 6, 3) };

    private static TableLayoutPanel Grid(int cols) => new()
    {
        ColumnCount = cols, AutoSize = true, Dock = DockStyle.Top, Padding = new Padding(2),
    };

    private static void AddStatus(TableLayoutPanel g, Label dot, Label text, string caption)
    {
        text.Text = caption; text.AutoSize = true; text.Margin = new Padding(0, 3, 0, 3);
        var row = new FlowLayoutPanel { AutoSize = true, Margin = new Padding(0) };
        row.Controls.Add(dot); row.Controls.Add(text);
        g.Controls.Add(row);
        g.SetColumnSpan(row, 2);
    }

    private static void Row(TableLayoutPanel g, string label, Control field)
    {
        g.Controls.Add(new Label { Text = label, AutoSize = true, Margin = new Padding(0, 6, 10, 6) });
        g.Controls.Add(field);
    }

    private Control Card(string title, Control content)
    {
        var header = new Label { Text = title.ToUpperInvariant(), AutoSize = true, ForeColor = Theme.Accent, Font = new Font("Segoe UI", 9, FontStyle.Bold), Margin = new Padding(2, 4, 0, 6) };
        var panel = new TableLayoutPanel { ColumnCount = 1, AutoSize = true, Dock = DockStyle.Top, BackColor = Theme.Panel, Padding = new Padding(12, 10, 12, 12), Margin = new Padding(0, 0, 0, 12) };
        panel.Controls.Add(header);
        panel.Controls.Add(content);
        return panel;
    }

    private void StyleAccents()
    {
        foreach (var b in new[] { _startStop })
        {
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderColor = Theme.Accent;
            b.BackColor = Theme.Panel;
            b.ForeColor = Theme.Accent;
        }
    }

    private void LoadFrom(AppConfig cfg)
    {
        _url.Text = cfg.Url;
        _ssl.Checked = cfg.UrlSslVerify;
        _auth.SelectedIndex = cfg.UseBearer ? 1 : 0;
        _token.Text = cfg.Token;
        _token.Enabled = cfg.UseBearer;
        _source.Text = cfg.Source;
        _interval.Text = cfg.IntervalSeconds.ToString(CultureInfo.InvariantCulture);
    }

    private AppConfig? ReadInto()
    {
        if (!double.TryParse(_interval.Text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var secs) || secs <= 0)
        {
            MessageBox.Show(this, "Interval must be a number greater than 0.", "Settings", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return null;
        }
        if (_url.Text.Trim().Length == 0)
        {
            MessageBox.Show(this, "Upload URL is required.", "Settings", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return null;
        }
        return new AppConfig
        {
            Url = _url.Text.Trim(),
            UrlSslVerify = _ssl.Checked,
            UseBearer = _auth.SelectedIndex == 1,
            Token = _token.Text.Trim(),
            Source = _source.Text.Trim().Length > 0 ? _source.Text.Trim() : "127.0.0.1:50051",
            IntervalSeconds = secs,
        };
    }

    private void OnSave()
    {
        var cfg = ReadInto();
        if (cfg == null) return;
        _tray.ApplyConfig(cfg);
    }

    private async Task OnTest()
    {
        var cfg = ReadInto();
        if (cfg == null) return;
        _testResult.ForeColor = Theme.Muted;
        _testResult.Text = "testing…";
        try
        {
            TestResult r = await ServerTester.RunAsync(cfg.Url, cfg.UrlSslVerify, cfg.EffectiveToken, CancellationToken.None);
            string creds = r.CredsOk == null ? (cfg.UseBearer ? $"credentials: {r.Creds}" : "no token to test") : (r.CredsOk.Value ? "credentials: accepted" : $"credentials: {r.Creds}");
            _testResult.ForeColor = r.ServerUp && r.CredsOk != false ? Theme.Green : Theme.Red;
            _testResult.Text = $"Server {r.Server}\n{creds}";
        }
        catch (Exception e) { _testResult.ForeColor = Theme.Red; _testResult.Text = e.Message; }
    }

    private async Task OnShowData()
    {
        Worker? w = _tray.CurrentWorker;
        if (w == null) { MessageBox.Show(this, "Not started yet.", "Latest data"); return; }
        if (!w.GameRunning) { MessageBox.Show(this, "The game is not running.", "Latest data"); return; }
        try
        {
            var (raw, processed) = await w.CaptureAsync(CancellationToken.None);
            using var f = new DataForm(raw, processed);
            f.ShowDialog(this);
        }
        catch (Exception e) { MessageBox.Show(this, e.Message, "Latest data", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    private void Refresh_()
    {
        Worker? w = _tray.CurrentWorker;
        bool running = w != null && !w.Paused;
        _startStop.Text = running ? "■  Stop" : "▶  Start";

        Set(_dotGame, _lblGame, "Game running", w?.GameRunning == true, "yes", "no");
        Set(_dotTele, _lblTele, "Game telemetry (gRPC)", w?.TelemetryUp == true, "connected", w?.GameRunning == true ? "down" : "idle", neutralWhenGameOff: true, gameOn: w?.GameRunning == true);
        Set(_dotSchema, _lblSchema, "Telemetry metadata", w?.SchemaLoaded == true, "loaded", "not loaded");
        Set(_dotUpload, _lblUpload, "Upload endpoint", w?.UploadUp == true, "ok", (w?.LastError != null) ? "error" : "unknown");

        _lastUpload.Text = w?.LastOkUtc is { } ok
            ? "Last successful upload: " + ok.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
            : "Last successful upload: never";
        _lastUpload.ForeColor = Theme.Muted;

        _tray.UpdateIcon();
    }

    private static void Set(Label dot, Label text, string caption, bool ok, string okWord, string badWord, bool neutralWhenGameOff = false, bool gameOn = true)
    {
        if (neutralWhenGameOff && !gameOn) { dot.ForeColor = Theme.Grey; text.Text = $"{caption}: idle"; text.ForeColor = Theme.Muted; return; }
        dot.ForeColor = ok ? Theme.Green : Theme.Red;
        text.Text = $"{caption}: {(ok ? okWord : badWord)}";
        text.ForeColor = Theme.Text;
    }

    public static void OpenUrl(string url)
    {
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // Hide to tray instead of exiting, unless the app is really shutting down.
        if (e.CloseReason == CloseReason.UserClosing && !_tray.Exiting)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        _timer.Stop();
        base.OnFormClosing(e);
    }
}
