using System.Collections.Generic;
using Game.Core.Defs;
using Game.Core.Model;

namespace Game.Core.Systems
{
    public enum PlaceError
    {
        None = 0,
        UnknownFurniture = 1,
        LevelTooLow = 2,
        OutOfBounds = 3,
        Overlapped = 4,
        NotOwned = 5,
        NotPlaced = 6,
    }

    public readonly struct PlaceResult
    {
        public readonly PlaceError Error;
        public readonly PlacedItem Item;

        public PlaceResult(PlaceError error, PlacedItem item = null)
        {
            Error = error;
            Item = item;
        }

        public bool Ok => Error == PlaceError.None;

        public static readonly PlaceResult Success = new PlaceResult(PlaceError.None);
    }

    /// <summary>
    /// 房间装饰：摆放校验 + 舒适度计算。
    /// 舒适度是装饰和经营之间唯一的耦合点，所有加成都从这里出。
    /// </summary>
    public sealed class DecorSystem
    {
        private readonly IGameConfig _config;

        public DecorSystem(IGameConfig config)
        {
            _config = config;
        }

        public PlaceResult Place(SaveData save, string defId, int x, int y, int rot)
        {
            var def = _config.GetFurniture(defId);
            if (def == null) return new PlaceResult(PlaceError.UnknownFurniture);
            if (save.level < def.UnlockLevel) return new PlaceResult(PlaceError.LevelTooLow);
            if (!save.room.storage.Contains(defId)) return new PlaceResult(PlaceError.NotOwned);

            var grid = BuildGrid(save.room);
            GridMap.GetFootprint(def.Width, def.Height, rot, out var w, out var h);
            if (!grid.IsInside(x, y, w, h)) return new PlaceResult(PlaceError.OutOfBounds);
            if (!grid.IsFree(def.Layer, x, y, w, h)) return new PlaceResult(PlaceError.Overlapped);

            var item = new PlacedItem(defId, x, y, rot, def.Layer);
            save.room.items.Add(item);
            save.room.storage.Remove(defId);
            return new PlaceResult(PlaceError.None, item);
        }

        /// <summary>把家具收回收纳区。</summary>
        public PlaceResult Store(SaveData save, PlacedItem item)
        {
            if (item == null || !save.room.items.Remove(item)) return new PlaceResult(PlaceError.NotPlaced);

            save.room.storage.Add(item.defId);
            return PlaceResult.Success;
        }

        public PlaceResult Move(SaveData save, PlacedItem item, int x, int y, int rot)
        {
            if (item == null || !save.room.items.Contains(item)) return new PlaceResult(PlaceError.NotPlaced);

            var def = _config.GetFurniture(item.defId);
            if (def == null) return new PlaceResult(PlaceError.UnknownFurniture);

            var grid = BuildGrid(save.room, item);
            GridMap.GetFootprint(def.Width, def.Height, rot, out var w, out var h);
            if (!grid.IsInside(x, y, w, h)) return new PlaceResult(PlaceError.OutOfBounds);
            if (!grid.IsFree(def.Layer, x, y, w, h)) return new PlaceResult(PlaceError.Overlapped);

            item.x = x;
            item.y = y;
            item.rot = rot;
            return new PlaceResult(PlaceError.None, item);
        }

        /// <summary>
        /// 舒适度 = 所有在场家具的舒适度之和，齐套的套装额外 +20%。
        /// 只算摆出来的，收纳里的不算——这是"装修"而不是"囤货"的激励。
        /// </summary>
        public int CalcComfort(RoomState room)
        {
            var total = 0;
            var placedIds = new HashSet<string>();
            var setContribution = new Dictionary<string, int>();

            for (var i = 0; i < room.items.Count; i++)
            {
                var def = _config.GetFurniture(room.items[i].defId);
                if (def == null) continue;

                total += def.Comfort;
                placedIds.Add(def.Id);

                if (string.IsNullOrEmpty(def.SetId)) continue;

                setContribution.TryGetValue(def.SetId, out var sum);
                setContribution[def.SetId] = sum + def.Comfort;
            }

            foreach (var pair in setContribution)
            {
                var members = _config.GetSetMembers(pair.Key);
                if (members == null || members.Count == 0) continue;

                var complete = true;
                for (var i = 0; i < members.Count; i++)
                {
                    if (placedIds.Contains(members[i])) continue;
                    complete = false;
                    break;
                }

                if (complete) total += (int)(pair.Value * SetBonusRatio);
            }

            return total;
        }

        public const float SetBonusRatio = 0.2f;

        public ComfortTier GetTier(SaveData save) => GetTier(CalcComfort(save.room));

        public ComfortTier GetTier(int comfort)
        {
            var tiers = _config.ComfortTiers;
            ComfortTier best = null;

            for (var i = 0; i < tiers.Count; i++)
            {
                if (comfort < tiers[i].minComfort) continue;
                if (best == null || tiers[i].minComfort > best.minComfort) best = tiers[i];
            }

            return best ?? EmptyTier;
        }

        private static readonly ComfortTier EmptyTier = new ComfortTier();

        private GridMap BuildGrid(RoomState room, PlacedItem ignore = null)
        {
            var grid = new GridMap(room.width, room.height);
            for (var i = 0; i < room.items.Count; i++)
            {
                var item = room.items[i];
                if (ReferenceEquals(item, ignore)) continue;

                var def = _config.GetFurniture(item.defId);
                if (def == null) continue;

                GridMap.GetFootprint(def.Width, def.Height, item.rot, out var w, out var h);
                grid.Occupy(item.layer, item.x, item.y, w, h);
            }

            return grid;
        }
    }
}
