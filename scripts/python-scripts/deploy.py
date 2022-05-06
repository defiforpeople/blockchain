from brownie import TestingAavePool, accounts, config, network, interface
# AAVE_LENDING_POOL_ADDRESS_PROVIDER = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5"


def main():
    """
    Deploy a `Aave` contract from `accounts[0]`.
    """

    acct = accounts.add(
        config["wallets"]["from_key"]
    )  # add your keystore ID as an argument to this call

    aave_lending_pool_address = interface.IPoolAddressesProvider(
        config["networks"][network.show_active()]["aave_lending_pool_v3"],
        
    )

    aave = TestingAavePool.deploy(
        aave_lending_pool_address,
        {"from": acct},
    )
    return aave