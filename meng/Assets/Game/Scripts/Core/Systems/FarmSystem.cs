using System;
using Game.Core.Defs;
using Game.Core.Model;
using Game.Core.Services;

namespace Game.Core.Systems
{
    public enum FarmError
    {
        None = 0,
        PlotNotFound = 1,
        PlotOccupied = 2,
        PlotEmpty = 3,
        UnknownCrop = 4,
        LevelTooLow = 5,
        NotEnoughCoin = 6,
        NotRipe = 7,
        AlreadyWatered = 8,
        BarnNotFound = 9,
        UnknownAnimal = 10,
        NotEnoughFeed = 11,
        NotReady = 12,
    }

    public readonly struct FarmResult
    {
        public readonly FarmError Error;
        public readonly string ItemId;
        public readonly int Amount;
        public readonly int Exp;

        public FarmResult(FarmError error, string itemId = null, int amount = 0, int exp = 0)
        {
            Error = error;
            ItemId = itemId;
            Amount = amount;
            Exp = exp;
        }

        public bool Ok => Error == FarmError.None;

        public static FarmResult Fail(FarmError error) => new FarmResult(error);
    }

    public readonly struct GrowthInfo
    {
        public readonly bool Planted;
        public readonly bool Ripe;
        public readonly int Stage;
        public readonly long RemainingSeconds;
        public readonly float Progress;

        public GrowthInfo(bool planted, bool ripe, int stage, long remaining, float progress)
        {
            Planted = planted;
            Ripe = ripe;
            Stage = stage;
            RemainingSeconds = remaining;
            Progress = progress;
        }

        public static readonly GrowthInfo Empty = new GrowthInfo(false, false, 0, 0, 0f);
    }

    /// <summary>
    /// 种植与养殖。所有成熟判定都是 时间戳 + 时长 的纯计算，不跑 Update，
    /// 离线回来直接算得出结果。
    /// </summary>
    public sealed class FarmSystem
    {
        private readonly IGameConfig _config;
        private readonly ITimeService _time;
        private readonly DecorSystem _decor;

        public FarmSystem(IGameConfig config, ITimeService time, DecorSystem decor)
        {
            _config = config;
            _time = time;
            _decor = decor;
        }

        public FarmResult Plant(SaveData save, int plotId, string cropId)
        {
            var def = _config.GetCrop(cropId);
            if (def == null) return FarmResult.Fail(FarmError.UnknownCrop);
            if (save.level < def.UnlockLevel) return FarmResult.Fail(FarmError.LevelTooLow);

            var plot = save.farm.GetPlot(plotId);
            if (plot == null) return FarmResult.Fail(FarmError.PlotNotFound);
            if (!plot.IsEmpty) return FarmResult.Fail(FarmError.PlotOccupied);
            if (!save.wallet.CanAfford(CurrencyType.Coin, def.SeedPrice)) return FarmResult.Fail(FarmError.NotEnoughCoin);

            save.wallet.TrySpend(CurrencyType.Coin, def.SeedPrice);

            // 生长时长在播种时锁定，把当时的舒适度加成算进去。
            // 之后再装修不会追溯加速已经种下的作物——否则玩家会觉得时间在乱跳。
            var speedBonus = _decor.GetTier(save).growthSpeedBonus;
            plot.cropId = def.Id;
            plot.plantedAt = _time.NowUtc;
            plot.growSeconds = Math.Max(1, (int)Math.Round(def.GrowSeconds * (1f - speedBonus)));
            plot.waterBonusSeconds = 0;
            plot.watered = false;

            return new FarmResult(FarmError.None, def.Id);
        }

        public FarmResult Water(SaveData save, int plotId)
        {
            var plot = save.farm.GetPlot(plotId);
            if (plot == null) return FarmResult.Fail(FarmError.PlotNotFound);
            if (plot.IsEmpty) return FarmResult.Fail(FarmError.PlotEmpty);
            if (plot.watered) return FarmResult.Fail(FarmError.AlreadyWatered);

            plot.watered = true;
            plot.waterBonusSeconds = Math.Max(1, (int)Math.Round(plot.growSeconds * _config.WaterSpeedupRatio));
            return new FarmResult(FarmError.None, plot.cropId);
        }

        public GrowthInfo GetGrowth(PlotState plot)
        {
            if (plot == null || plot.IsEmpty) return GrowthInfo.Empty;

            var def = _config.GetCrop(plot.cropId);
            var total = Math.Max(1, plot.growSeconds - plot.waterBonusSeconds);
            var elapsed = _time.NowUtc - plot.plantedAt;
            if (elapsed < 0) elapsed = 0;

            if (elapsed >= total) return new GrowthInfo(true, true, def?.Stages ?? 1, 0, 1f);

            var progress = (float)elapsed / total;
            var stages = Math.Max(1, def?.Stages ?? 1);
            var stage = (int)(progress * stages);
            if (stage >= stages) stage = stages - 1;

            return new GrowthInfo(true, false, stage, total - elapsed, progress);
        }

        public FarmResult Harvest(SaveData save, int plotId)
        {
            var plot = save.farm.GetPlot(plotId);
            if (plot == null) return FarmResult.Fail(FarmError.PlotNotFound);
            if (plot.IsEmpty) return FarmResult.Fail(FarmError.PlotEmpty);
            if (!GetGrowth(plot).Ripe) return FarmResult.Fail(FarmError.NotRipe);

            var def = _config.GetCrop(plot.cropId);
            if (def == null) return FarmResult.Fail(FarmError.UnknownCrop);

            var yield = Math.Max(1, def.Yield);
            save.inventory.Add(def.Id, yield);
            plot.Clear();

            return new FarmResult(FarmError.None, def.Id, yield, def.Exp);
        }

        public FarmResult Feed(SaveData save, string barnId)
        {
            var barn = save.farm.GetBarn(barnId);
            if (barn == null) return FarmResult.Fail(FarmError.BarnNotFound);

            var def = _config.GetAnimal(barn.animalId);
            if (def == null) return FarmResult.Fail(FarmError.UnknownAnimal);
            if (barn.IsFed && !IsProduceReady(barn, def)) return FarmResult.Fail(FarmError.NotReady);
            if (!save.inventory.TryRemove(def.FeedItemId, def.FeedCount)) return FarmResult.Fail(FarmError.NotEnoughFeed);

            barn.fedAt = _time.NowUtc;
            return new FarmResult(FarmError.None, def.FeedItemId, def.FeedCount);
        }

        public bool IsProduceReady(BarnState barn, IAnimalDef def)
        {
            if (barn == null || def == null || !barn.IsFed) return false;
            return _time.NowUtc - barn.fedAt >= def.ProduceSeconds;
        }

        public FarmResult Collect(SaveData save, string barnId)
        {
            var barn = save.farm.GetBarn(barnId);
            if (barn == null) return FarmResult.Fail(FarmError.BarnNotFound);

            var def = _config.GetAnimal(barn.animalId);
            if (def == null) return FarmResult.Fail(FarmError.UnknownAnimal);
            if (!IsProduceReady(barn, def)) return FarmResult.Fail(FarmError.NotReady);

            var count = Math.Max(1, def.ProduceCount) * Math.Max(1, barn.level);
            save.inventory.Add(def.ProduceItemId, count);
            barn.fedAt = 0;
            barn.intimacy++;

            return new FarmResult(FarmError.None, def.ProduceItemId, count, def.Exp);
        }
    }
}
