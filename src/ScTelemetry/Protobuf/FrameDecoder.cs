using System.Text;

namespace ScTelemetry.Protobuf;

/// <summary>
/// Decodes a protobuf message (the game's TelemetryStreamResponse frame) into a
/// plain object tree using the <see cref="Schema"/>, so field numbers become names
/// and enum numbers become their readable names. The tree is made of
/// Dictionary&lt;string,object?&gt; (messages), List&lt;object?&gt; (repeated) and scalars,
/// ready for System.Text.Json.
/// </summary>
internal sealed class FrameDecoder
{
    private readonly Schema _schema;

    public FrameDecoder(Schema schema) => _schema = schema;

    public Dictionary<string, object?> Decode(byte[] msg, string rootType) =>
        DecodeMessage(msg, 0, msg.Length, rootType);

    private Dictionary<string, object?> DecodeMessage(byte[] d, int start, int len, string typeName)
    {
        MessageType? mt = _schema.Message(typeName);
        var obj = new Dictionary<string, object?>();
        int i = start, end = start + len;
        while (i < end)
        {
            ulong tag = Wire.ReadVarint(d, ref i);
            int fn = (int)(tag >> 3), wt = (int)(tag & 7);

            Field? fld = null;
            mt?.Fields.TryGetValue(fn, out fld);

            string name = fld?.Name ?? $"field_{fn}";
            object? val = fld != null ? TypedValue(d, ref i, wt, fld) : RawValue(d, ref i, wt);
            Add(obj, name, val, fld?.Repeated ?? false);
        }
        return obj;
    }

    private static void Add(Dictionary<string, object?> o, string name, object? val, bool repeated)
    {
        if (repeated)
        {
            if (!o.TryGetValue(name, out var cur) || cur is not List<object?> list)
            {
                list = new List<object?>();
                o[name] = list;
            }
            if (val is List<object?> packed) list.AddRange(packed);   // packed scalars
            else list.Add(val);
        }
        else
        {
            o[name] = val;
        }
    }

    private object? TypedValue(byte[] d, ref int i, int wt, Field f)
    {
        if (wt == Wire.Len)
        {
            int len = (int)Wire.ReadVarint(d, ref i);
            int s = i; i += len;
            switch (f.Type)
            {
                case PType.Message: return DecodeMessage(d, s, len, f.TypeName);
                case PType.String: return Encoding.UTF8.GetString(d, s, len);
                case PType.Bytes: return Convert.ToBase64String(d, s, len);
                default:
                    // length-delimited scalar => packed repeated
                    return f.Repeated ? DecodePacked(d, s, len, f) : Convert.ToBase64String(d, s, len);
            }
        }

        switch (wt)
        {
            case Wire.Varint: return ScalarVarint(Wire.ReadVarint(d, ref i), f);
            case Wire.I64: { ulong v = BitConverter.ToUInt64(d, i); i += 8; return ScalarI64(v, f); }
            case Wire.I32: { uint v = BitConverter.ToUInt32(d, i); i += 4; return ScalarI32(v, f); }
            default: throw new FormatException($"bad wire type {wt}");
        }
    }

    private List<object?> DecodePacked(byte[] d, int start, int len, Field f)
    {
        var list = new List<object?>();
        int i = start, end = start + len;
        while (i < end)
        {
            switch (WireForType(f.Type))
            {
                case Wire.Varint: list.Add(ScalarVarint(Wire.ReadVarint(d, ref i), f)); break;
                case Wire.I64: { ulong v = BitConverter.ToUInt64(d, i); i += 8; list.Add(ScalarI64(v, f)); break; }
                case Wire.I32: { uint v = BitConverter.ToUInt32(d, i); i += 4; list.Add(ScalarI32(v, f)); break; }
                default: i = end; break;
            }
        }
        return list;
    }

    private object ScalarVarint(ulong raw, Field f) => f.Type switch
    {
        PType.Bool => raw != 0,
        PType.Enum => EnumName(f.TypeName, (int)(long)raw),
        PType.Int32 => (int)(long)raw,
        PType.Int64 => (long)raw,
        PType.UInt32 => (uint)raw,
        PType.UInt64 => raw,
        PType.SInt32 => (int)Wire.ZigZag(raw),
        PType.SInt64 => Wire.ZigZag(raw),
        _ => raw,
    };

    private static object ScalarI64(ulong v, Field f) => f.Type switch
    {
        PType.Double => BitConverter.Int64BitsToDouble((long)v),
        PType.SFixed64 => (long)v,
        _ => v,   // Fixed64
    };

    private static object ScalarI32(uint v, Field f) => f.Type switch
    {
        PType.Float => BitConverter.Int32BitsToSingle((int)v),
        PType.SFixed32 => (int)v,
        _ => v,   // Fixed32
    };

    private object EnumName(string typeName, int num)
    {
        EnumType? e = _schema.Enum(typeName);
        if (e != null && e.Values.TryGetValue(num, out var n)) return n;
        return num;   // unknown enum value: keep the number
    }

    private static int WireForType(PType t) => t switch
    {
        PType.Double or PType.Fixed64 or PType.SFixed64 => Wire.I64,
        PType.Float or PType.Fixed32 or PType.SFixed32 => Wire.I32,
        _ => Wire.Varint,
    };

    private static object? RawValue(byte[] d, ref int i, int wt)
    {
        switch (wt)
        {
            case Wire.Varint: return Wire.ReadVarint(d, ref i);
            case Wire.I64: { ulong v = BitConverter.ToUInt64(d, i); i += 8; return v; }
            case Wire.I32: { uint v = BitConverter.ToUInt32(d, i); i += 4; return v; }
            case Wire.Len:
                int len = (int)Wire.ReadVarint(d, ref i);
                int s = i; i += len;
                return Convert.ToBase64String(d, s, len);
            default: throw new FormatException($"bad wire type {wt}");
        }
    }
}
