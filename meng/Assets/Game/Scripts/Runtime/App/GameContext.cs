using Game.Config;
using Game.Core.Model;
using Game.Core.Systems;
using Game.Runtime.Services;

namespace Game.Runtime.App
{
    /// <summary>
    /// 一局游戏的全部依赖。View 层只读这里，不自己 new 系统。
    /// 不做成 static 单例是为了单测能造第二份。GameApp 会持有唯一实例。
    /// </summary>
    public sealed class GameContext
    {
        public GameContext(GameConfigAsset config, GameTimeService time, SaveService saveService)
        {
            Config = config;
            Time = time;
            SaveService = saveService;

            Decor = new DecorSystem(config);
            Farm = new FarmSystem(config, time, Decor);
            Economy = new EconomySystem(config, Decor);
        }

        public GameConfigAsset Config { get; }
        public GameTimeService Time { get; }
        public SaveService SaveService { get; }

        public DecorSystem Decor { get; }
        public FarmSystem Farm { get; }
        public EconomySystem Economy { get; }

        public SaveData Save => SaveService.Current;

        /// <summary>改完状态调一下，存档会在下一个节流窗口落盘。</summary>
        public void MarkDirty() => SaveService.MarkDirty();
    }
}
