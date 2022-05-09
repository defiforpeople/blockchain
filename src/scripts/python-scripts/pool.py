from brownie import TestingAavePool, accounts, config, network, interface
# from "scripts/deploy.py" import deploy
from scripts.helpful_scripts import get_account
from scripts.get_weth import get_weth

def main():
    SUPPLY_AMOUNT = 1000000000000

    # contract_address = deploy()
    testing_aave = TestingAavePool[-1]
    print(testing_aave.address)

    account = get_account()
    print(account)

    weth = interface.WethInterface(config["networks"][network.show_active()]["weth"])

    aave_pool_address = testing_aave.getPool()
    # print(aave_pool_address)

    # user_info = testing_aave.getUser(account.address)
    # print(user_info)
    # if weth.balanceOf(account) < SUPPLY_AMOUNT:
    #     print("Gettiing WETH...")
    #     tx = get_weth(SUPPLY_AMOUNT)
    #     tx.wait(1)


    # print("Transfering to contract...")

    app_tx = weth.approve(testing_aave, SUPPLY_AMOUNT, {"from": account})
    # weth.transfer(testing_aave, SUPPLY_AMOUNT, {"from": account})
    # # app_tx = weth.approve(aave_pool_address, SUPPLY_AMOUNT, {"from": account})
    # app_tx.wait(1)
    # print("Transferred!")

    print(weth.balanceOf(testing_aave))

    print("Executing Supply...")
    gas_limit = 2074044
    tx = testing_aave.supplyLiquidity(SUPPLY_AMOUNT, weth.address, {
        "from": account,
        "gas_limit": gas_limit,
        'allow_revert': True
        })
    return tx

main()