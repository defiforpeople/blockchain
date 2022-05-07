from brownie import TestingAavePool, accounts, config, network, interface
from scripts.helpful_scripts import get_account, get_weth

def main(supply_amount=1000000000000):
    account = get_account()

    aave_pool_contract = interface.IPool(config["networks"][network.show_active()]["aave_lending_pool_v3"])
    print(aave_pool_contract.ADDRESSES_PROVIDER())


    weth = interface.IERC20(config["networks"][network.show_active()]["weth"])
    app_tx = weth.approve(aave_pool_contract, supply_amount, {"from": account})
    app_tx.wait(1) # wait for transaction to be mined
    # Not sure if it is necessary on a tesnet, but it is in a local network

    print("Supplying... ")
    gas_limit = 2074044
    tx = aave_pool_contract.supply(weth.address,
    supply_amount,
    account.address,
    0, {
        "from": account,
        "gas_limit": gas_limit,
        'allow_revert': True
        })
    tx.wait(1)

    print("Borrowing... ")
    tx = aave_pool_contract.borrow(
    weth.address,
    supply_amount + 100000000000,
    2, # Interest rate mode
    0,
    account.address, {
        "from": account,
        "gas_limit": gas_limit,
        'allow_revert': True
        })
    return tx

main(1000000000000)