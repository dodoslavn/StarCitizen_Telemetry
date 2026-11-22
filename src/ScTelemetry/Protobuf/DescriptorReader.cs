using System.Text;

namespace ScTelemetry.Protobuf;

/// <summary>
/// Hand-rolled reader for the handful of descriptor.proto messages we need
/// (FileDescriptorProto / DescriptorProto / FieldDescriptorProto / enums), so we
/// can turn the schema embedded in StarCitizen.exe into a <see cref="Schema"/>
/// with no protobuf library.
/// </summary>
internal static class DescriptorReader
{
    private readonly struct Token
    {
        public readonly int Field;
        public readonly int Wt;
        public readonly int Start;  // payload start (length-delimited / fixed)
        public readonly int Len;    // payload length (length-delimited / fixed)
        public readonly ulong V;    // value (varint)
        public Token(int field, int wt, int start, int len, ulong v)
        {
            Field = field; Wt = wt; Start = start; Len = len; V = v;
        }
    }

    private static List<Token> Scan(byte[] d, int start, int len)
    {
        var tokens = new List<Token>();
        int i = start, end = start + len;
        while (i < end)
        {
            ulong tag = Wire.ReadVarint(d, ref i);
            int field = (int)(tag >> 3), wt = (int)(tag & 7);
            switch (wt)
            {
                case Wire.Varint:
                    tokens.Add(new Token(field, wt, 0, 0, Wire.ReadVarint(d, ref i)));
                    break;
                case Wire.I64:
                    tokens.Add(new Token(field, wt, i, 8, 0)); i += 8;
                    break;
                case Wire.I32:
                    tokens.Add(new Token(field, wt, i, 4, 0)); i += 4;
                    break;
                case Wire.Len:
                    int l = (int)Wire.ReadVarint(d, ref i);
                    tokens.Add(new Token(field, wt, i, l, 0)); i += l;
                    break;
                default:
                    throw new FormatException($"bad wire type {wt}");
            }
        }
        return tokens;
    }

    private static string Utf8(byte[] d, int start, int len) => Encoding.UTF8.GetString(d, start, len);

    /// <summary>Parse one FileDescriptorProto blob and merge it into the schema.</summary>
    public static void ParseFile(byte[] d, int start, int len, Schema schema)
    {
        var tokens = Scan(d, start, len);
        string package = "";
        foreach (var t in tokens)
            if (t.Field == 2 && t.Wt == Wire.Len) { package = Utf8(d, t.Start, t.Len); break; }

        string scope = package.Length > 0 ? "." + package : "";
        foreach (var t in tokens)
        {
            if (t.Wt != Wire.Len) continue;
            switch (t.Field)
            {
                case 4: ParseMessage(d, t.Start, t.Len, scope, schema); break;   // message_type
                case 5: ParseEnum(d, t.Start, t.Len, scope, schema); break;      // enum_type
                case 6: ParseService(d, t.Start, t.Len, scope, schema); break;   // service
            }
        }
    }

    private static void ParseMessage(byte[] d, int start, int len, string scope, Schema schema)
    {
        var tokens = Scan(d, start, len);
        string name = "";
        foreach (var t in tokens)
            if (t.Field == 1 && t.Wt == Wire.Len) { name = Utf8(d, t.Start, t.Len); break; }

        string full = scope + "." + name;
        var mt = new MessageType { FullName = full };
        foreach (var t in tokens)
        {
            if (t.Wt != Wire.Len) continue;
            switch (t.Field)
            {
                case 2: var f = ParseField(d, t.Start, t.Len); mt.Fields[f.Number] = f; break; // field
                case 3: ParseMessage(d, t.Start, t.Len, full, schema); break;                   // nested_type
                case 4: ParseEnum(d, t.Start, t.Len, full, schema); break;                      // enum_type
            }
        }
        schema.Messages[full] = mt;
    }

    private static Field ParseField(byte[] d, int start, int len)
    {
        var tokens = Scan(d, start, len);
        var f = new Field();
        foreach (var t in tokens)
        {
            switch (t.Field)
            {
                case 1: if (t.Wt == Wire.Len) f.Name = Utf8(d, t.Start, t.Len); break;    // name
                case 3: if (t.Wt == Wire.Varint) f.Number = (int)t.V; break;              // number
                case 4: if (t.Wt == Wire.Varint) f.Repeated = t.V == 3; break;            // label (3 = repeated)
                case 5: if (t.Wt == Wire.Varint) f.Type = (PType)t.V; break;              // type
                case 6: if (t.Wt == Wire.Len) f.TypeName = Utf8(d, t.Start, t.Len); break; // type_name
            }
        }
        return f;
    }

    private static void ParseEnum(byte[] d, int start, int len, string scope, Schema schema)
    {
        var tokens = Scan(d, start, len);
        string name = "";
        foreach (var t in tokens)
            if (t.Field == 1 && t.Wt == Wire.Len) { name = Utf8(d, t.Start, t.Len); break; }

        var et = new EnumType { FullName = scope + "." + name };
        foreach (var t in tokens)
        {
            if (t.Field != 2 || t.Wt != Wire.Len) continue;   // value
            var value = Scan(d, t.Start, t.Len);
            string vn = ""; int num = 0;
            foreach (var x in value)
            {
                if (x.Field == 1 && x.Wt == Wire.Len) vn = Utf8(d, x.Start, x.Len);
                else if (x.Field == 2 && x.Wt == Wire.Varint) num = (int)x.V;
            }
            et.Values[num] = vn;
        }
        schema.Enums[et.FullName] = et;
    }

    private static void ParseService(byte[] d, int start, int len, string scope, Schema schema)
    {
        var tokens = Scan(d, start, len);
        foreach (var t in tokens)
            if (t.Field == 1 && t.Wt == Wire.Len)
            {
                schema.Services.Add(scope + "." + Utf8(d, t.Start, t.Len));
                return;
            }
    }
}
