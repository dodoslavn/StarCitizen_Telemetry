using System.Drawing;
using System.Drawing.Drawing2D;

namespace Integrator;

/// <summary>Tray icons: a dark "SC" disc with a status-coloured underline bar.
/// Built once per colour and cached (a handful of unmanaged handles for the app's life).</summary>
internal static class IconFactory
{
    private static readonly Dictionary<int, Icon> Cache = new();

    public static Icon Make(Color underline)
    {
        if (Cache.TryGetValue(underline.ToArgb(), out var cached)) return cached;

        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using (var bg = new SolidBrush(Color.FromArgb(10, 19, 29)))
                g.FillEllipse(bg, 0, 0, 31, 28);
            using (var pen = new Pen(Color.FromArgb(21, 198, 236), 1.5f))
                g.DrawEllipse(pen, 1, 1, 29, 26);
            using (var font = new Font("Segoe UI", 11, FontStyle.Bold, GraphicsUnit.Pixel))
            using (var fg = new SolidBrush(Color.FromArgb(21, 198, 236)))
            {
                var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                g.DrawString("SC", font, fg, new RectangleF(0, 0, 32, 29), fmt);
            }
            using (var bar = new SolidBrush(underline))
                g.FillRectangle(bar, 2, 29, 28, 3);
        }
        var icon = Icon.FromHandle(bmp.GetHicon());
        Cache[underline.ToArgb()] = icon;
        return icon;
    }
}
