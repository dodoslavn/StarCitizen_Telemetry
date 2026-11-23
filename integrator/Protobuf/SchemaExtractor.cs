using System.Text;

namespace Integrator.Protobuf;

/// <summary>
/// Reads the telemetry API's protobuf definitions straight out of StarCitizen.exe.
/// The game embeds its FileDescriptorProtos (sc/game/telemetry/v1/*.proto); pulling
/// them from the installed exe means we always match the installed build, even after
/// a patch. Ported from the 7Hills Link reference implementation (protoset.py).
/// </summary>
internal static class SchemaExtractor
{
    private const string Needle = "sc/game/telemetry";

    // FileDescriptorProto field number -> expected wire type (used to bound a blob).
    private static int FdpWire(int field) => field switch
    {
        >= 1 and <= 9 => Wire.Len,
        10 or 11 or 14 => Wire.Varint,
        12 => Wire.Len,
        _ => -1,
    };

    /// <summary>Follow fields from <paramref name="start"/> while they look like a
    /// FileDescriptorProto; returns the exclusive end offset.</summary>
    private static int Walk(byte[] b, int start, int limit = 4 << 20)
    {
        int i = start, end = Math.Min(b.Length, start + limit);
        bool seenName = false;
        while (i < end)
        {
            int j = i;
            ulong tag;
            try { tag = Wire.ReadVarint(b, ref j); } catch { break; }
            int field = (int)(tag >> 3), wt = (int)(tag & 7);
            if (FdpWire(field) != wt || (field == 1 && seenName)) break;
            try
            {
                if (wt == Wire.Varint) Wire.ReadVarint(b, ref j);
                else if (wt == Wire.Len) { int ln = (int)Wire.ReadVarint(b, ref j); j += ln; }
                else break;
            }
            catch { break; }
            if (j > end) break;
            seenName |= field == 1;
            i = j;
        }
        return i;
    }

    /// <summary>Scan the raw exe bytes and return the winning FileDescriptorProto blobs.</summary>
    public static List<byte[]> ExtractBlobs(string exePath)
    {
        byte[] d = File.ReadAllBytes(exePath);
        var needle = Encoding.ASCII.GetBytes(Needle);
        // Keep the largest blob per file name (shorter ones are usually truncated).
        var best = new Dictionary<string, (int start, int end)>();

        int pos = 0;
        while (pos < d.Length)
        {
            int rel = d.AsSpan(pos).IndexOf(needle);
            if (rel < 0) break;
            int nameStart = pos + rel;
            pos = nameStart + needle.Length;

            // A FileDescriptorProto starts with field 1 (name): tag 0x0A then a length varint.
            for (int back = 2; back <= 3; back++)
            {
                int s = nameStart - back;
                if (s < 0 || d[s] != 0x0A) continue;
                int j = s + 1;
                int ln;
                try { ln = (int)Wire.ReadVarint(d, ref j); } catch { continue; }
                if (j != nameStart || nameStart + ln > d.Length) continue;
                string fname = Encoding.ASCII.GetString(d, nameStart, ln);
                if (!fname.EndsWith(".proto", StringComparison.Ordinal)) continue;

                int end = Walk(d, s);
                if (end - s < 8) continue;
                if (!best.TryGetValue(fname, out var cur) || (end - s) > (cur.end - cur.start))
                    best[fname] = (s, end);
            }
        }

        var blobs = new List<byte[]>(best.Count);
        foreach (var (start, end) in best.Values)
            blobs.Add(d[start..end]);
        return blobs;
    }

    /// <summary>Build a schema from previously extracted FileDescriptorProto blobs.</summary>
    public static Schema BuildSchema(IEnumerable<byte[]> blobs)
    {
        var schema = new Schema();
        foreach (var blob in blobs)
        {
            try { DescriptorReader.ParseFile(blob, 0, blob.Length, schema); }
            catch { /* skip a blob that didn't parse cleanly */ }
        }
        return schema;
    }

    /// <summary>Extract the schema by scanning the raw exe bytes.</summary>
    public static Schema Extract(string exePath) => BuildSchema(ExtractBlobs(exePath));

    /// <summary>Does the schema contain the telemetry service? (sanity check)</summary>
    public static bool HasTelemetryService(Schema s) =>
        s.Services.Exists(name => name.EndsWith(".GameTelemetryService", StringComparison.Ordinal));
}
