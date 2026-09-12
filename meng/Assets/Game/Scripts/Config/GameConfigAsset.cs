using System.Collections.Generic;
using Game.Core.Defs;
using UnityEngine;

namespace Game.Config
{
    /// <summary>
    /// 全部配表的入口。运行时只读。
    /// 字典在第一次访问时建，避免 OnEnable 里因为资源加载顺序拿到半成品。
    /// </summary>
    [CreateAssetMenu(menuName = "Game/Config/Game Config", fileName = "GameConfig")]
    public sealed class GameConfigAsset : ScriptableObject, IGameConfig
    {
        [Header("配表")]
        [SerializeField] private List<CropDefAsset> crops = new List<CropDefAsset>();
        [SerializeField] private List<AnimalDefAsset> animals = new List<AnimalDefAsset>();
        [SerializeField] private List<FurnitureDefAsset> furnitures = new List<FurnitureDefAsset>();
        [SerializeField] private List<ItemDefAsset> items = new List<ItemDefAsset>();

        [Header("舒适度档位（装饰 -> 经营的加成）")]
        [SerializeField] private List<ComfortTier> comfortTiers = new List<ComfortTier>();

        [Header("成长")]
        [SerializeField] private int maxLevel = 30;
        [SerializeField] private int expBase = 100;
        [SerializeField] private float expGrowth = 1.35f;

        [Header("开局")]
        [SerializeField] private int startPlotCount = 6;
        [SerializeField] private int startCoin = 200;

        [Header("规则")]
        [Range(0f, 0.5f)]
        [SerializeField] private float waterSpeedupRatio = 0.1f;

        private Dictionary<string, CropDefAsset> _cropMap;
        private Dictionary<string, AnimalDefAsset> _animalMap;
        private Dictionary<string, FurnitureDefAsset> _furnitureMap;
        private Dictionary<string, ItemDefAsset> _itemMap;
        private Dictionary<string, List<string>> _setMap;
        private List<ICropDef> _cropList;
        private List<IFurnitureDef> _furnitureList;

        public int StartPlotCount => startPlotCount;
        public int StartCoin => startCoin;
        public int MaxLevel => maxLevel;
        public float WaterSpeedupRatio => waterSpeedupRatio;

        public ICropDef GetCrop(string id) => Lookup(EnsureCropMap(), id);
        public IAnimalDef GetAnimal(string id) => Lookup(EnsureAnimalMap(), id);
        public IFurnitureDef GetFurniture(string id) => Lookup(EnsureFurnitureMap(), id);
        public IItemDef GetItem(string id) => Lookup(EnsureItemMap(), id);

        public IReadOnlyList<ICropDef> Crops
        {
            get
            {
                if (_cropList == null)
                {
                    _cropList = new List<ICropDef>(crops.Count);
                    foreach (var crop in crops)
                    {
                        if (crop != null) _cropList.Add(crop);
                    }
                }

                return _cropList;
            }
        }

        public IReadOnlyList<IFurnitureDef> Furnitures
        {
            get
            {
                if (_furnitureList == null)
                {
                    _furnitureList = new List<IFurnitureDef>(furnitures.Count);
                    foreach (var furniture in furnitures)
                    {
                        if (furniture != null) _furnitureList.Add(furniture);
                    }
                }

                return _furnitureList;
            }
        }

        public IReadOnlyList<ComfortTier> ComfortTiers => comfortTiers;

        public IReadOnlyList<string> GetSetMembers(string setId)
        {
            if (string.IsNullOrEmpty(setId)) return System.Array.Empty<string>();

            if (_setMap == null)
            {
                _setMap = new Dictionary<string, List<string>>();
                foreach (var furniture in furnitures)
                {
                    if (furniture == null || string.IsNullOrEmpty(furniture.SetId)) continue;

                    if (!_setMap.TryGetValue(furniture.SetId, out var list))
                    {
                        list = new List<string>();
                        _setMap[furniture.SetId] = list;
                    }

                    list.Add(furniture.Id);
                }
            }

            return _setMap.TryGetValue(setId, out var members) ? members : System.Array.Empty<string>();
        }

        /// <summary>等级曲线：expBase * growth^(level-1)，前期快后期慢，够用且好调。</summary>
        public int ExpToNextLevel(int level)
        {
            if (level < 1 || level >= maxLevel) return 0;
            return Mathf.RoundToInt(expBase * Mathf.Pow(expGrowth, level - 1));
        }

        /// <summary>配表改动后清缓存。编辑器里改完配置立刻生效，不用重启。</summary>
        public void InvalidateCache()
        {
            _cropMap = null;
            _animalMap = null;
            _furnitureMap = null;
            _itemMap = null;
            _setMap = null;
            _cropList = null;
            _furnitureList = null;
        }

        private void OnValidate() => InvalidateCache();

        private static T Lookup<T>(Dictionary<string, T> map, string id) where T : class
        {
            if (string.IsNullOrEmpty(id)) return null;
            return map.TryGetValue(id, out var value) ? value : null;
        }

        private Dictionary<string, CropDefAsset> EnsureCropMap() => _cropMap ??= Build(crops);
        private Dictionary<string, AnimalDefAsset> EnsureAnimalMap() => _animalMap ??= Build(animals);
        private Dictionary<string, FurnitureDefAsset> EnsureFurnitureMap() => _furnitureMap ??= Build(furnitures);
        private Dictionary<string, ItemDefAsset> EnsureItemMap() => _itemMap ??= Build(items);

        private static Dictionary<string, T> Build<T>(List<T> source) where T : DefAsset
        {
            var map = new Dictionary<string, T>(source.Count);
            foreach (var def in source)
            {
                if (def == null || string.IsNullOrEmpty(def.Id)) continue;

                if (map.ContainsKey(def.Id))
                {
                    Debug.LogError($"[GameConfig] 配表 id 重复：{def.Id}（{def.name}）");
                    continue;
                }

                map[def.Id] = def;
            }

            return map;
        }
    }
}
