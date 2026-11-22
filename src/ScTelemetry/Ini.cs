namespace ScTelemetry;

/// <summary>Tiny INI reader: `key = value`, `#`/`;` comments, sections ignored.</summary>
internal static class Ini
{
    public static Dictionary<string, string> Parse(IEnumerable<string> lines)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in lines)
        {
            string line = raw.Trim();
            if (line.Length == 0 || line[0] == '#' || line[0] == ';' || line[0] == '[') continue;

            int eq = line.IndexOf('=');
            if (eq <= 0) continue;

            string key = line[..eq].Trim();
            string value = line[(eq + 1)..].Trim();

            // strip a trailing inline comment that isn't inside quotes
            int hash = value.IndexOfAny(new[] { '#', ';' });
            if (hash >= 0 && (value.Length == 0 || value[0] != '"')) value = value[..hash].Trim();

            map[key] = value;
        }
        return map;
    }
}
