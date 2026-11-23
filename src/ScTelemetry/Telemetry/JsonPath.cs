namespace ScTelemetry.Telemetry;

/// <summary>Navigate a decoded frame (nested dictionaries/lists) by a dotted path.</summary>
internal static class JsonPath
{
    public const string Missing = "-";

    public static object? Get(object? root, string? path)
    {
        if (string.IsNullOrEmpty(path)) return root;
        object? cur = root;
        foreach (var key in path.Split('.'))
        {
            switch (cur)
            {
                case Dictionary<string, object?> d when d.TryGetValue(key, out var v):
                    cur = v;
                    break;
                case List<object?> list when int.TryParse(key, out var i) && i >= 0 && i < list.Count:
                    cur = list[i];
                    break;
                default:
                    return Missing;
            }
        }
        return cur;
    }
}
