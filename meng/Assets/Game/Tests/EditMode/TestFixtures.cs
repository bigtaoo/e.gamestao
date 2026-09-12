using System.Collections.Generic;
using Game.Core.Defs;
using Game.Core.Services;

namespace Game.Tests
{
    /// <summary>可控时钟。单测里绝不能等真实时间。</summary>
    internal sealed class FakeTimeService : ITimeService
    {
        public long NowUtc { get; set; } = 1_000_000;
        public bool IsSynced => true;

        public void Advance(long seconds) => NowUtc += seconds;
    }

    internal sealed class FakeCrop : ICropDef
    {
        public string Id { get; set; } = "radish";
        public int UnlockLevel { get; set; } = 1;
        public int SeedPrice { get; set; } = 10;
        public int GrowSeconds { get; set; } = 300;
        public int SellPrice { get; set; } = 25;
        public int Exp { get; set; } = 3;
        public int Yield { get; set; } = 1;
        public int Stages { get; set; } = 3;
    }

    internal sealed class FakeAnimal : IAnimalDef
    {
        public string Id { get; set; } = "chicken";
        public int UnlockLevel { get; set; } = 1;
        public string FeedItemId { get; set; } = "corn";
        public int FeedCount { get; set; } = 1;
        public int ProduceSeconds { get; set; } = 1800;
        public string ProduceItemId { get; set; } = "egg";
        public int ProduceCount { get; set; } = 1;
        public int Exp { get; set; } = 5;
    }

    internal sealed class FakeFurniture : IFurnitureDef
    {
        public string Id { get; set; } = "sofa";
        public int UnlockLevel { get; set; } = 1;
        public int Price { get; set; } = 100;
        public int Comfort { get; set; } = 10;
        public int Width { get; set; } = 1;
        public int Height { get; set; } = 1;
        public int Layer { get; set; } = 1;
        public string SetId { get; set; } = "";
    }

    internal sealed class FakeItem : IItemDef
    {
        public string Id { get; set; } = "egg";
        public int SellPrice { get; set; } = 40;
    }

    internal sealed class FakeConfig : IGameConfig
    {
        private readonly Dictionary<string, ICropDef> _crops = new Dictionary<string, ICropDef>();
        private readonly Dictionary<string, IAnimalDef> _animals = new Dictionary<string, IAnimalDef>();
        private readonly Dictionary<string, IFurnitureDef> _furnitures = new Dictionary<string, IFurnitureDef>();
        private readonly Dictionary<string, IItemDef> _items = new Dictionary<string, IItemDef>();
        private readonly List<ComfortTier> _tiers = new List<ComfortTier>();

        public float WaterSpeedupRatio { get; set; } = 0.1f;
        public int MaxLevel { get; set; } = 30;
        public int ExpPerLevel { get; set; } = 100;

        public FakeConfig Add(ICropDef def)
        {
            _crops[def.Id] = def;
            return this;
        }

        public FakeConfig Add(IAnimalDef def)
        {
            _animals[def.Id] = def;
            return this;
        }

        public FakeConfig Add(IFurnitureDef def)
        {
            _furnitures[def.Id] = def;
            return this;
        }

        public FakeConfig Add(IItemDef def)
        {
            _items[def.Id] = def;
            return this;
        }

        public FakeConfig AddTier(int minComfort, float sellBonus, float growthBonus)
        {
            _tiers.Add(new ComfortTier
            {
                minComfort = minComfort,
                sellPriceBonus = sellBonus,
                growthSpeedBonus = growthBonus,
            });
            return this;
        }

        public ICropDef GetCrop(string id) => id != null && _crops.TryGetValue(id, out var d) ? d : null;
        public IAnimalDef GetAnimal(string id) => id != null && _animals.TryGetValue(id, out var d) ? d : null;
        public IFurnitureDef GetFurniture(string id) => id != null && _furnitures.TryGetValue(id, out var d) ? d : null;
        public IItemDef GetItem(string id) => id != null && _items.TryGetValue(id, out var d) ? d : null;

        public IReadOnlyList<ICropDef> Crops => new List<ICropDef>(_crops.Values);
        public IReadOnlyList<IFurnitureDef> Furnitures => new List<IFurnitureDef>(_furnitures.Values);
        public IReadOnlyList<ComfortTier> ComfortTiers => _tiers;

        public IReadOnlyList<string> GetSetMembers(string setId)
        {
            var members = new List<string>();
            if (string.IsNullOrEmpty(setId)) return members;

            foreach (var pair in _furnitures)
            {
                if (pair.Value.SetId == setId) members.Add(pair.Key);
            }

            return members;
        }

        public int ExpToNextLevel(int level) => level >= MaxLevel ? 0 : ExpPerLevel;
    }
}
