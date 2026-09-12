using System;
using System.Collections.Generic;

namespace Game.Core.Model
{
    /// <summary>家具分层。同层互斥，不同层可叠（沙发可以压在地毯上，摆件可以放在桌面上）。</summary>
    public enum FurnitureLayer
    {
        Rug = 0,
        Floor = 1,
        Tabletop = 2,
        Wall = 3,
    }

    [Serializable]
    public class RoomState
    {
        public int width = 10;
        public int height = 10;
        public string floorId = "";
        public string wallId = "";
        public List<PlacedItem> items = new List<PlacedItem>();

        /// <summary>收纳区：已拥有但没摆出来的家具。</summary>
        public List<string> storage = new List<string>();
    }

    [Serializable]
    public class PlacedItem
    {
        public string defId;
        public int x;
        public int y;

        /// <summary>0/1/2/3 对应 0°/90°/180°/270°。</summary>
        public int rot;

        public int layer;

        public PlacedItem() { }

        public PlacedItem(string defId, int x, int y, int rot, int layer)
        {
            this.defId = defId;
            this.x = x;
            this.y = y;
            this.rot = rot;
            this.layer = layer;
        }
    }
}
