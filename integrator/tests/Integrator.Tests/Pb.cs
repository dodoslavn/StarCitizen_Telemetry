using System.Text;

namespace Integrator.Tests;

/// <summary>Minimal protobuf encoder used to build synthetic descriptors and messages.</summary>
internal static class Pb
{
    public static void Varint(List<byte> b, ulong v)
    {
        while (true)
        {
            byte c = (byte)(v & 0x7F);
            v >>= 7;
            if (v != 0) b.Add((byte)(c | 0x80));
            else { b.Add(c); break; }
        }
    }

    public static void Tag(List<byte> b, int field, int wt) => Varint(b, (ulong)((field << 3) | wt));

    public static void VarintField(List<byte> b, int field, ulong v) { Tag(b, field, 0); Varint(b, v); }

    public static void LenField(List<byte> b, int field, byte[] payload)
    {
        Tag(b, field, 2);
        Varint(b, (ulong)payload.Length);
        b.AddRange(payload);
    }

    public static void StringField(List<byte> b, int field, string s) => LenField(b, field, Encoding.UTF8.GetBytes(s));

    public static void FloatField(List<byte> b, int field, float v)
    {
        Tag(b, field, 5);
        b.AddRange(BitConverter.GetBytes(v));
    }
}
