using System.Drawing;
using System.Windows.Forms;

namespace ScTelemetry;

/// <summary>Dark cyan (RSI-ish) theme matching the website.</summary>
internal static class Theme
{
    public static readonly Color Bg = Color.FromArgb(5, 8, 12);
    public static readonly Color Panel = Color.FromArgb(12, 20, 30);
    public static readonly Color Line = Color.FromArgb(24, 45, 60);
    public static readonly Color Accent = Color.FromArgb(21, 198, 236);
    public static readonly Color Text = Color.FromArgb(185, 204, 216);
    public static readonly Color Head = Color.FromArgb(234, 247, 252);
    public static readonly Color Muted = Color.FromArgb(95, 118, 134);

    // status colours
    public static readonly Color Green = Color.FromArgb(63, 227, 155);
    public static readonly Color Red = Color.FromArgb(255, 90, 82);
    public static readonly Color Orange = Color.FromArgb(224, 163, 58);
    public static readonly Color Grey = Color.FromArgb(120, 135, 148);

    /// <summary>Recursively apply the theme to a control tree.</summary>
    public static void Apply(Control root)
    {
        foreach (Control c in root.Controls)
        {
            switch (c)
            {
                case Button b:
                    b.FlatStyle = FlatStyle.Flat;
                    b.FlatAppearance.BorderColor = Line;
                    b.BackColor = Panel;
                    b.ForeColor = Accent;
                    break;
                case TextBox t:
                    t.BackColor = Color.FromArgb(4, 9, 14);
                    t.ForeColor = Head;
                    t.BorderStyle = BorderStyle.FixedSingle;
                    break;
                case ComboBox cb:
                    cb.BackColor = Color.FromArgb(4, 9, 14);
                    cb.ForeColor = Head;
                    cb.FlatStyle = FlatStyle.Flat;
                    break;
                case CheckBox ch:
                    ch.ForeColor = Text;
                    break;
                case LinkLabel ll:
                    ll.LinkColor = Accent;
                    ll.ActiveLinkColor = Head;
                    ll.ForeColor = Text;
                    break;
                case Label lb:
                    lb.ForeColor = lb.Tag as string == "head" ? Head : Text;
                    break;
                case Panel p:
                    p.BackColor = Panel;
                    break;
            }
            if (c.HasChildren) Apply(c);
        }
    }
}
