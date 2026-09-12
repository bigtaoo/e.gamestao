using System;

namespace Game.Core.Model
{
    /// <summary>存档根节点。只放纯数据，不放逻辑——逻辑在 Game.Core.Systems 里。</summary>
    [Serializable]
    public class SaveData
    {
        /// <summary>当前存档结构版本，改字段结构时 +1 并在 SaveMigrator 里补一条迁移。</summary>
        public const int CurrentSchemaVersion = 1;

        public int schemaVersion = CurrentSchemaVersion;
        public string playerId = "";
        public string nickname = "";
        public int level = 1;
        public int exp;

        /// <summary>上次在线时间（UTC 秒），用于离线结算与"多久没回来"的判断。</summary>
        public long lastSeenUtc;

        public Wallet wallet = new Wallet();
        public FarmState farm = new FarmState();
        public RoomState room = new RoomState();
        public InventoryState inventory = new InventoryState();

        public static SaveData CreateNew(string playerId, long nowUtc, int startPlots, int startCoin)
        {
            var save = new SaveData
            {
                playerId = playerId,
                lastSeenUtc = nowUtc,
            };
            save.wallet.coin = startCoin;
            save.farm.EnsurePlotCount(startPlots);
            return save;
        }
    }
}
