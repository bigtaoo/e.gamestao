namespace Game.Core.Services
{
    /// <summary>
    /// 游戏内所有"现在几点"都必须走这里。
    /// 直接用 DateTime.UtcNow 会被改系统时间刷掉离线产出。
    /// </summary>
    public interface ITimeService
    {
        /// <summary>当前 UTC 秒。以服务器时间为准，本地时间跳变不影响。</summary>
        long NowUtc { get; }

        /// <summary>是否已经和服务器对过时。未对时前只能当只读参考，不能用于结算。</summary>
        bool IsSynced { get; }
    }

    public interface IStorage
    {
        bool Exists(string key);
        string Read(string key);
        void Write(string key, string contents);
        void Delete(string key);
    }

    /// <summary>存档编解码。放接口是为了以后换成二进制或加签名时不动上层。</summary>
    public interface ISaveCodec
    {
        string Encode(Model.SaveData save);
        Model.SaveData Decode(string raw);

        /// <summary>只读出 schemaVersion，用于迁移前判定，不做完整反序列化。</summary>
        int PeekSchemaVersion(string raw);
    }
}
