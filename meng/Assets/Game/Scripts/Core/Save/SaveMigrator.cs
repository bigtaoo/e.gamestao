using System;
using System.Collections.Generic;
using Game.Core.Model;

namespace Game.Core.Save
{
    /// <summary>
    /// 存档迁移。每次改 SaveData 结构：
    /// 1) SaveData.CurrentSchemaVersion +1
    /// 2) 这里注册一条 from -> from+1 的迁移
    /// 线上版本改过结构又没写迁移，就是玩家存档直接炸掉。
    /// </summary>
    public static class SaveMigrator
    {
        private static readonly Dictionary<int, Func<SaveData, SaveData>> Steps =
            new Dictionary<int, Func<SaveData, SaveData>>
            {
                // 示例（v1 是首版，暂时没有前置版本）：
                // { 1, save => { save.room.width = 12; return save; } },
            };

        public static bool NeedsMigration(int schemaVersion) => schemaVersion < SaveData.CurrentSchemaVersion;

        public static SaveData Migrate(SaveData save)
        {
            if (save == null) return null;

            var guard = 0;
            while (save.schemaVersion < SaveData.CurrentSchemaVersion)
            {
                if (!Steps.TryGetValue(save.schemaVersion, out var step))
                {
                    throw new InvalidOperationException(
                        $"缺少存档迁移步骤：v{save.schemaVersion} -> v{save.schemaVersion + 1}");
                }

                save = step(save);
                save.schemaVersion++;

                if (++guard > 64) throw new InvalidOperationException("存档迁移进入死循环");
            }

            return save;
        }
    }
}
