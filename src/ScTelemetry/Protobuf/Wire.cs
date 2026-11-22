namespace ScTelemetry.Protobuf;

/// <summary>Minimal protobuf wire-format primitives (pure BCL, no dependencies).</summary>
internal static class Wire
{
    public const int Varint = 0;
    public const int I64 = 1;
    public const int Len = 2;
    public const int I32 = 5;

    /// <summary>Read a base-128 varint, advancing <paramref name="i"/>.</summary>
    public static ulong ReadVarint(ReadOnlySpan<byte> b, ref int i)
    {
        ulong result = 0;
        int shift = 0;
        while (i < b.Length)
        {
            byte c = b[i++];
            result |= (ulong)(c & 0x7F) << shift;
            if ((c & 0x80) == 0) return result;
            shift += 7;
            if (shift > 63) break;
        }
        throw new FormatException("truncated varint");
    }

    /// <summary>ZigZag-decode a sint32/sint64 varint.</summary>
    public static long ZigZag(ulong v) => (long)(v >> 1) ^ -(long)(v & 1);
}
