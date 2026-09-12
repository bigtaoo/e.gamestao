using System;
using System.Collections.Generic;

namespace Game.Core.Defs
{
    /// <summary>
    /// 配表只读接口。Systems 只认接口，不认 ScriptableObject——
    /// 这样核心逻辑可以脱离 Unity 跑单测，配表实现换成远端下发也不用改逻辑。
    /// </summary>
    public interface ICropDef
    {
        string Id { get; }
        int UnlockLevel { get; }
        int SeedPrice { get; }
        int GrowSeconds { get; }
        int SellPrice { get; }
        int Exp { get; }
        int Yield { get; }

        /// <summary>生长表现阶段数（不含成熟），用于换贴图。</summary>
        int Stages { get; }
    }

    public interface IAnimalDef
    {
        string Id { get; }
        int UnlockLevel { get; }
        string FeedItemId { get; }
        int FeedCount { get; }
        int ProduceSeconds { get; }
        string ProduceItemId { get; }
        int ProduceCount { get; }
        int Exp { get; }
    }

    public interface IFurnitureDef
    {
        string Id { get; }
        int UnlockLevel { get; }
        int Price { get; }
        int Comfort { get; }
        int Width { get; }
        int Height { get; }
        int Layer { get; }

        /// <summary>所属套装，空串表示不属于任何套装。</summary>
        string SetId { get; }
    }

    public interface IItemDef
    {
        string Id { get; }
        int SellPrice { get; }
    }

    /// <summary>舒适度档位。装饰给经营的加成就挂在这里——两个系统的耦合点只有这一处。</summary>
    [Serializable]
    public class ComfortTier
    {
        public int minComfort;

        /// <summary>售价加成，0.05 = +5%。</summary>
        public float sellPriceBonus;

        /// <summary>生长加速，0.05 = 时间 -5%。</summary>
        public float growthSpeedBonus;

        /// <summary>离线产出结算上限（小时）。</summary>
        public int offlineHours = 8;
    }

    public interface IGameConfig
    {
        ICropDef GetCrop(string id);
        IAnimalDef GetAnimal(string id);
        IFurnitureDef GetFurniture(string id);
        IItemDef GetItem(string id);

        IReadOnlyList<ICropDef> Crops { get; }
        IReadOnlyList<IFurnitureDef> Furnitures { get; }
        IReadOnlyList<ComfortTier> ComfortTiers { get; }

        /// <summary>套装 setId 下的全部家具 id，用于齐套判定。</summary>
        IReadOnlyList<string> GetSetMembers(string setId);

        /// <summary>从 level 升到 level+1 所需经验。</summary>
        int ExpToNextLevel(int level);

        int MaxLevel { get; }

        /// <summary>浇水减免比例，0.1 = 减 10% 总时长。</summary>
        float WaterSpeedupRatio { get; }
    }
}
