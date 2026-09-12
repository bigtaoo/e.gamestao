using System;
using Game.Core.Model;
using Game.Core.Save;
using Game.Core.Services;
using UnityEngine;

namespace Game.Runtime.Services
{
    /// <summary>
    /// 存档读写调度。标脏后节流落盘，切后台/退出时强制写。
    /// 每次操作都立刻写文件会在低端机上造成明显卡顿。
    /// </summary>
    public sealed class SaveService
    {
        public const string DefaultKey = "player";

        private readonly IStorage _storage;
        private readonly ISaveCodec _codec;
        private readonly float _flushInterval;

        private bool _dirty;
        private float _timer;

        public SaveService(IStorage storage, ISaveCodec codec, float flushIntervalSeconds = 5f)
        {
            _storage = storage;
            _codec = codec;
            _flushInterval = flushIntervalSeconds;
        }

        public SaveData Current { get; private set; }

        public event Action<SaveData> Loaded;

        public SaveData LoadOrCreate(string playerId, long nowUtc, int startPlots, int startCoin)
        {
            SaveData save = null;

            if (_storage.Exists(DefaultKey))
            {
                var raw = _storage.Read(DefaultKey);
                save = _codec.Decode(raw);

                if (save != null && SaveMigrator.NeedsMigration(save.schemaVersion))
                {
                    var from = save.schemaVersion;
                    save = SaveMigrator.Migrate(save);
                    Debug.Log($"[Save] 存档已迁移 v{from} -> v{save.schemaVersion}");
                    MarkDirty();
                }
            }

            if (save == null)
            {
                save = SaveData.CreateNew(playerId, nowUtc, startPlots, startCoin);
                MarkDirty();
            }

            save.lastSeenUtc = nowUtc;
            Current = save;
            Loaded?.Invoke(save);
            return save;
        }

        public void MarkDirty() => _dirty = true;

        /// <summary>由 GameApp 每帧调用。</summary>
        public void Tick(float deltaTime)
        {
            if (!_dirty) return;

            _timer += deltaTime;
            if (_timer < _flushInterval) return;

            Flush();
        }

        public void Flush()
        {
            _timer = 0f;
            if (!_dirty || Current == null) return;

            try
            {
                _storage.Write(DefaultKey, _codec.Encode(Current));
                _dirty = false;
            }
            catch (Exception e)
            {
                Debug.LogError($"[Save] 落盘失败：{e.Message}");
            }
        }
    }
}
