namespace ScTelemetry.Protobuf;

/// <summary>protobuf field types (FieldDescriptorProto.Type).</summary>
internal enum PType
{
    Double = 1, Float = 2, Int64 = 3, UInt64 = 4, Int32 = 5, Fixed64 = 6,
    Fixed32 = 7, Bool = 8, String = 9, Group = 10, Message = 11, Bytes = 12,
    UInt32 = 13, Enum = 14, SFixed32 = 15, SFixed64 = 16, SInt32 = 17, SInt64 = 18,
}

internal sealed class Field
{
    public string Name = "";
    public int Number;
    public PType Type;
    public string TypeName = "";   // fully-qualified (leading dot), for Message/Enum fields
    public bool Repeated;
}

internal sealed class MessageType
{
    public string FullName = "";
    public readonly Dictionary<int, Field> Fields = new();
}

internal sealed class EnumType
{
    public string FullName = "";
    public readonly Dictionary<int, string> Values = new();
}

/// <summary>
/// Symbol table built from every FileDescriptorProto found in the game exe.
/// Message/enum names are fully-qualified with a leading dot, matching the
/// type_name references protobuf stores in fields.
/// </summary>
internal sealed class Schema
{
    public readonly Dictionary<string, MessageType> Messages = new();
    public readonly Dictionary<string, EnumType> Enums = new();
    public readonly List<string> Services = new();

    public MessageType? Message(string fullName) =>
        Messages.TryGetValue(fullName, out var m) ? m : null;

    public EnumType? Enum(string fullName) =>
        Enums.TryGetValue(fullName, out var e) ? e : null;

    /// <summary>Full name of a message whose simple name matches, or null.</summary>
    public string? FindMessageEndingWith(string simpleName)
    {
        foreach (var name in Messages.Keys)
            if (name.EndsWith("." + simpleName, StringComparison.Ordinal))
                return name;
        return null;
    }
}
