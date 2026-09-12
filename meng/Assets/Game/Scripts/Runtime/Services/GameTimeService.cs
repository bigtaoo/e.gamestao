using System;
using Game.Core.Services;
using UnityEngine;

namespace Game.Runtime.Services
{
    /// <summary>
    /// 单调时钟。登录时用服务器时间对一次，之后靠 Time.realtimeSinceStartup 往前推。
    /// 玩家改系统时间不会影响它——这是离线收益防作弊的第一道闸。
    /// 没有后端时退化成本地时间，但会记录 IsSynced=false，结算逻辑可以据此决定要不要信任。
    /// </summary>
    public sealed class GameTimeService : ITimeService
    {
        private static readonly DateTime Epoch = new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        private long _syncedServerUtc;
        private double _syncedRealtime;
        private bool _isSynced;

        public GameTimeService()
        {
            // 未对时前先用本地时间兜底，保证任何时候 NowUtc 都是可用值。
            _syncedServerUtc = LocalUtcNow();
            _syncedRealtime = Time.realtimeSinceStartupAsDouble;
        }

        public bool IsSynced => _isSynced;

        public long NowUtc
        {
            get
            {
                var elapsed = Time.realtimeSinceStartupAsDouble - _syncedRealtime;
                if (elapsed < 0) elapsed = 0;
                return _syncedServerUtc + (long)elapsed;
            }
        }

        public void SyncWithServer(long serverUtcSeconds)
        {
            _syncedServerUtc = serverUtcSeconds;
            _syncedRealtime = Time.realtimeSinceStartupAsDouble;
            _isSynced = true;
        }

        public static long LocalUtcNow() => (long)(DateTime.UtcNow - Epoch).TotalSeconds;

        public static DateTime ToDateTime(long utcSeconds) => Epoch.AddSeconds(utcSeconds);
    }
}
