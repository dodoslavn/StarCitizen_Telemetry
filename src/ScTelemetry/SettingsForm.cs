using System.Globalization;
using System.Windows.Forms;
using ScTelemetry.Telemetry;

namespace ScTelemetry;

/// <summary>GUI editor for the tool's settings. Returns the edited config on OK.</summary>
internal sealed class SettingsForm : Form
{
    private readonly TextBox _interval = new();
    private readonly TextBox _url = new();
    private readonly TextBox _token = new();
    private readonly TextBox _source = new();
    private readonly TextBox _exe = new();
    private readonly CheckBox _sslVerify = new() { Text = "Verify the endpoint's TLS certificate", AutoSize = true };

    /// <summary>The edited settings (valid only when DialogResult == OK).</summary>
    public AppConfig Result { get; } = new();

    public SettingsForm(AppConfig cfg)
    {
        Text = "StarCitizen Telemetry — Settings";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new System.Drawing.Size(540, 300);

        // populate from current config
        _interval.Text = cfg.IntervalSeconds.ToString(CultureInfo.InvariantCulture);
        _url.Text = cfg.Url;
        _token.Text = cfg.Token;
        _source.Text = cfg.Source;
        _exe.Text = cfg.ExePath;
        _sslVerify.Checked = cfg.UrlSslVerify;

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12),
            ColumnCount = 2,
            RowCount = 7,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        AddRow(layout, "Interval (s)", _interval);
        AddRow(layout, "Upload URL", _url);
        AddRow(layout, "Token", _token);
        AddRow(layout, "", _sslVerify);
        AddRow(layout, "Game source", _source);

        // exe row: textbox + Browse
        var exePanel = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Height = 28, Margin = new Padding(0) };
        exePanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        exePanel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 80));
        _exe.Dock = DockStyle.Fill;
        var browse = new Button { Text = "Browse…", Dock = DockStyle.Fill };
        browse.Click += (_, _) => BrowseExe();
        exePanel.Controls.Add(_exe, 0, 0);
        exePanel.Controls.Add(browse, 1, 0);
        AddRow(layout, "Game exe", exePanel);

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Bottom, FlowDirection = FlowDirection.RightToLeft, Height = 44, Padding = new Padding(8) };
        var cancel = new Button { Text = "Cancel", DialogResult = DialogResult.Cancel, Width = 80 };
        var save = new Button { Text = "Save", Width = 80 };
        var test = new Button { Text = "Test upload", Width = 100 };
        save.Click += (_, _) => OnSave();
        test.Click += async (_, _) => await OnTest();
        buttons.Controls.Add(cancel);
        buttons.Controls.Add(save);
        buttons.Controls.Add(test);

        Controls.Add(layout);
        Controls.Add(buttons);
        CancelButton = cancel;
        AcceptButton = save;
    }

    private static void AddRow(TableLayoutPanel layout, string label, Control field)
    {
        int row = layout.RowStyles.Count;
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        layout.Controls.Add(new Label { Text = label, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(3, 8, 3, 3) }, 0, row);
        if (field is TextBox tb) tb.Dock = DockStyle.Fill;
        layout.Controls.Add(field, 1, row);
    }

    private void BrowseExe()
    {
        using var dlg = new OpenFileDialog { Filter = "StarCitizen.exe|StarCitizen.exe|All executables|*.exe", Title = "Select StarCitizen.exe" };
        if (dlg.ShowDialog(this) == DialogResult.OK) _exe.Text = dlg.FileName;
    }

    private bool TryBuild(out AppConfig cfg)
    {
        cfg = Result;
        if (!double.TryParse(_interval.Text.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var secs) || secs <= 0)
        {
            MessageBox.Show(this, "Interval must be a number greater than 0.", "Settings", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        if (_url.Text.Trim().Length == 0)
        {
            MessageBox.Show(this, "Upload URL is required.", "Settings", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return false;
        }
        cfg.IntervalSeconds = secs;
        cfg.Url = _url.Text.Trim();
        cfg.Token = _token.Text.Trim();
        cfg.Source = _source.Text.Trim().Length > 0 ? _source.Text.Trim() : "127.0.0.1:50051";
        cfg.ExePath = _exe.Text.Trim();
        cfg.UrlSslVerify = _sslVerify.Checked;
        return true;
    }

    private void OnSave()
    {
        if (!TryBuild(out _)) return;
        DialogResult = DialogResult.OK;
        Close();
    }

    private async Task OnTest()
    {
        if (!TryBuild(out var cfg)) return;
        try
        {
            using var up = new Uploader(cfg.Url, cfg.UrlSslVerify, cfg.Token);
            await up.PostAsync("{\"test\":true,\"from\":\"ScTelemetry settings\"}", CancellationToken.None);
            MessageBox.Show(this, "Upload succeeded.", "Test upload", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception e)
        {
            MessageBox.Show(this, "Upload failed:\n" + e.Message, "Test upload", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
