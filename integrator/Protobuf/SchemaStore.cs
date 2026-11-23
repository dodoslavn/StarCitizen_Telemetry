namespace Integrator.Protobuf;

/// <summary>
/// Loads the schema for a given StarCitizen.exe, caching the extracted descriptor
/// blobs on disk (keyed by the exe's size + last-write time) so later launches skip
/// the ~hundred-megabyte scan.
/// </summary>
internal static class SchemaStore
{
    private const uint Magic = 0x53435401;   // "SCT\x01"

    public static Schema Load(string exePath, string cacheDir)
    {
        var info = new FileInfo(exePath);
        if (!info.Exists) throw new FileNotFoundException("StarCitizen.exe not found", exePath);

        string cache = Path.Combine(cacheDir,
            $"schema-{info.Length}-{info.LastWriteTimeUtc.Ticks}.bin");

        if (TryReadCache(cache, out var cached))
        {
            var fromCache = SchemaExtractor.BuildSchema(cached);
            if (SchemaExtractor.HasTelemetryService(fromCache)) return fromCache;
        }

        List<byte[]> blobs = SchemaExtractor.ExtractBlobs(exePath);
        var schema = SchemaExtractor.BuildSchema(blobs);
        if (!SchemaExtractor.HasTelemetryService(schema))
            throw new InvalidOperationException("This Star Citizen build has no telemetry service in its schema.");

        TryWriteCache(cache, cacheDir, blobs);
        return schema;
    }

    private static bool TryReadCache(string path, out List<byte[]> blobs)
    {
        blobs = new List<byte[]>();
        try
        {
            if (!File.Exists(path)) return false;
            using var fs = File.OpenRead(path);
            using var br = new BinaryReader(fs);
            if (br.ReadUInt32() != Magic) return false;
            int count = br.ReadInt32();
            for (int k = 0; k < count; k++)
            {
                int len = br.ReadInt32();
                blobs.Add(br.ReadBytes(len));
            }
            return blobs.Count > 0;
        }
        catch { return false; }
    }

    private static void TryWriteCache(string path, string cacheDir, List<byte[]> blobs)
    {
        try
        {
            Directory.CreateDirectory(cacheDir);
            foreach (var old in Directory.GetFiles(cacheDir, "schema-*.bin"))
                try { File.Delete(old); } catch { /* best effort */ }

            using var fs = File.Create(path);
            using var bw = new BinaryWriter(fs);
            bw.Write(Magic);
            bw.Write(blobs.Count);
            foreach (var blob in blobs)
            {
                bw.Write(blob.Length);
                bw.Write(blob);
            }
        }
        catch { /* cache is an optimisation; ignore write failures */ }
    }
}
