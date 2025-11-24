module prompt_market::prompt_market {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;

    /// 资产类型：0 = Prompt, 1 = LoRA
    const KIND_PROMPT: u8 = 0;
    const KIND_LORA: u8 = 1;

    /// 一个上架的资产
    struct Asset has key, store {
        id: UID,
        /// 创作者
        creator: address,
        /// 当前拥有者（未售出时 = creator，售出后 = buyer）
        owner: address,
        /// Walrus blob id（简单起见用字节数组）
        walrus_id: vector<u8>,
        /// 价格（单位：MIST / SUI）
        price: u64,
        /// 是否已售出
        sold: bool,
        /// 资产类型
        kind: u8,
        /// 简短名字（前端展示用，可选）
        name: vector<u8>,
    }

    /// Event emitted when an asset is listed
    struct AssetListed has copy, drop {
        asset_id: ID,
        creator: address,
        price: u64,
        kind: u8,
        name: vector<u8>,
    }

    /// Event emitted when an asset is sold
    struct AssetSold has copy, drop {
        asset_id: ID,
        buyer: address,
        price: u64,
    }

    /// 上架（将 Asset 作为共享对象发布）
    public fun list_asset(
        walrus_id: vector<u8>,
        price: u64,
        kind: u8,
        name: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(price > 0, 3); // Price must be positive

        let sender = tx_context::sender(ctx);
        let id = object::new(ctx);
        let asset_id = object::uid_to_inner(&id);
        let asset = Asset {
            id,
            creator: sender,
            owner: sender,
            walrus_id,
            price,
            sold: false,
            kind,
            name,
        };
        transfer::share_object(asset);

        event::emit(AssetListed {
            asset_id,
            creator: sender,
            price,
            kind,
            name,
        });
    }

    /// 购买（一次性买断）
    public fun buy_asset(
        asset: &mut Asset,
        payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(!asset.sold, 1); // 已售出则报错

        let price = asset.price;
        let payment_coin = payment;
        // 检查余额
        let balance = coin::value<SUI>(&payment_coin);
        assert!(balance >= price, 2);

        let creator = asset.creator;
        let buyer = tx_context::sender(ctx);

        // 切出应付金额
        let pay_coin = coin::split<SUI>(&mut payment_coin, price, ctx);
        // 支付给创作者（简单版：全部给创作者）
        transfer::public_transfer(pay_coin, creator);

        // 多余部分退回给买家
        transfer::public_transfer(payment_coin, buyer);

        // 更新所有者
        asset.owner = buyer;
        asset.sold = true;

        event::emit(AssetSold {
            asset_id: object::id(asset),
            buyer,
            price,
        });
    }
}
