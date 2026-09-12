using Game.Core.Defs;
using UnityEngine;

namespace Game.Config
{
    public abstract class DefAsset : ScriptableObject
    {
        [SerializeField] protected string id;
        [SerializeField] protected string displayName;
        [SerializeField] protected Sprite icon;
        [SerializeField] protected int unlockLevel = 1;

        public string Id => string.IsNullOrEmpty(id) ? name : id;
        public string DisplayName => displayName;
        public Sprite Icon => icon;
        public int UnlockLevel => unlockLevel;

        public void SetId(string value) => id = value;
    }

    [CreateAssetMenu(menuName = "Game/Config/Crop", fileName = "crop_")]
    public sealed class CropDefAsset : DefAsset, ICropDef
    {
        [SerializeField] private int seedPrice = 10;
        [SerializeField] private int growSeconds = 300;
        [SerializeField] private int sellPrice = 25;
        [SerializeField] private int exp = 3;
        [SerializeField] private int yield = 1;
        [SerializeField] private int stages = 3;
        [SerializeField] private Sprite[] stageSprites;

        public int SeedPrice => seedPrice;
        public int GrowSeconds => growSeconds;
        public int SellPrice => sellPrice;
        public int Exp => exp;
        public int Yield => yield;
        public int Stages => stages;
        public Sprite[] StageSprites => stageSprites;

        public void Fill(int seedPrice, int growSeconds, int sellPrice, int exp, int yield, int stages, int unlockLevel, string displayName)
        {
            this.seedPrice = seedPrice;
            this.growSeconds = growSeconds;
            this.sellPrice = sellPrice;
            this.exp = exp;
            this.yield = yield;
            this.stages = stages;
            this.unlockLevel = unlockLevel;
            this.displayName = displayName;
        }
    }

    [CreateAssetMenu(menuName = "Game/Config/Animal", fileName = "animal_")]
    public sealed class AnimalDefAsset : DefAsset, IAnimalDef
    {
        [SerializeField] private string feedItemId = "corn";
        [SerializeField] private int feedCount = 1;
        [SerializeField] private int produceSeconds = 1800;
        [SerializeField] private string produceItemId = "egg";
        [SerializeField] private int produceCount = 1;
        [SerializeField] private int exp = 5;

        public string FeedItemId => feedItemId;
        public int FeedCount => feedCount;
        public int ProduceSeconds => produceSeconds;
        public string ProduceItemId => produceItemId;
        public int ProduceCount => produceCount;
        public int Exp => exp;

        public void Fill(string feedItemId, int feedCount, int produceSeconds, string produceItemId, int produceCount, int exp, int unlockLevel, string displayName)
        {
            this.feedItemId = feedItemId;
            this.feedCount = feedCount;
            this.produceSeconds = produceSeconds;
            this.produceItemId = produceItemId;
            this.produceCount = produceCount;
            this.exp = exp;
            this.unlockLevel = unlockLevel;
            this.displayName = displayName;
        }
    }

    [CreateAssetMenu(menuName = "Game/Config/Furniture", fileName = "furn_")]
    public sealed class FurnitureDefAsset : DefAsset, IFurnitureDef
    {
        [SerializeField] private int price = 100;
        [SerializeField] private int comfort = 10;
        [SerializeField] private int width = 1;
        [SerializeField] private int height = 1;
        [SerializeField] private Core.Model.FurnitureLayer layer = Core.Model.FurnitureLayer.Floor;
        [SerializeField] private string setId = "";
        [SerializeField] private GameObject prefab;

        public int Price => price;
        public int Comfort => comfort;
        public int Width => Mathf.Max(1, width);
        public int Height => Mathf.Max(1, height);
        public int Layer => (int)layer;
        public string SetId => setId;
        public GameObject Prefab => prefab;

        public void Fill(int price, int comfort, int width, int height, int layer, string setId, int unlockLevel, string displayName)
        {
            this.price = price;
            this.comfort = comfort;
            this.width = width;
            this.height = height;
            this.layer = (Core.Model.FurnitureLayer)layer;
            this.setId = setId;
            this.unlockLevel = unlockLevel;
            this.displayName = displayName;
        }
    }

    [CreateAssetMenu(menuName = "Game/Config/Item", fileName = "item_")]
    public sealed class ItemDefAsset : DefAsset, IItemDef
    {
        [SerializeField] private int sellPrice;

        public int SellPrice => sellPrice;

        public void Fill(int sellPrice, string displayName)
        {
            this.sellPrice = sellPrice;
            this.displayName = displayName;
        }
    }
}
