using System;
using System.Collections.Generic;

namespace Game.Core.Model
{
    [Serializable]
    public class FarmState
    {
        public List<PlotState> plots = new List<PlotState>();
        public List<BarnState> barns = new List<BarnState>();

        public PlotState GetPlot(int id)
        {
            for (var i = 0; i < plots.Count; i++)
            {
                if (plots[i].id == id) return plots[i];
            }

            return null;
        }

        public BarnState GetBarn(string id)
        {
            for (var i = 0; i < barns.Count; i++)
            {
                if (barns[i].id == id) return barns[i];
            }

            return null;
        }

        /// <summary>把地块补齐到指定数量（扩地只增不减）。</summary>
        public void EnsurePlotCount(int count)
        {
            while (plots.Count < count)
            {
                plots.Add(new PlotState { id = plots.Count });
            }
        }
    }

    [Serializable]
    public class PlotState
    {
        public int id;

        /// <summary>空地时为 null 或空串。</summary>
        public string cropId;

        /// <summary>播种时刻（UTC 秒）。</summary>
        public long plantedAt;

        /// <summary>播种时锁定的生长总时长，已计入当时的舒适度加成——避免装修后旧作物被追溯改时间。</summary>
        public int growSeconds;

        /// <summary>浇水减免的秒数。</summary>
        public int waterBonusSeconds;

        public bool watered;

        public bool IsEmpty => string.IsNullOrEmpty(cropId);

        public void Clear()
        {
            cropId = null;
            plantedAt = 0;
            growSeconds = 0;
            waterBonusSeconds = 0;
            watered = false;
        }
    }

    [Serializable]
    public class BarnState
    {
        public string id;
        public string animalId;
        public int level = 1;

        /// <summary>上次投喂时刻（UTC 秒）。0 表示空栏，需要先投喂才会开始产出。</summary>
        public long fedAt;

        public int intimacy;

        public bool IsFed => fedAt > 0;
    }
}
