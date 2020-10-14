import { createModule, mutation, action } from "vuex-class-component";
import {
  web3,
  compareString,
  onboard,
  selectedWeb3Wallet
} from "@/api/helpers";
import { ABISmartToken, ethReserveAddress } from "@/api/ethConfig";
import { EthAddress } from "@/types/bancor";
import { fromWei, isAddress, toHex, toWei } from "web3-utils";
import { shrinkToken } from "@/api/ethBancorCalc";

const tx = (data: any) =>
  new Promise((resolve, reject) => {
    console.log("pumping into web3.eth.sendTransaction is...", data);
    web3.eth
      .sendTransaction(data)
      .on("transactionHash", hash => {
        console.log("returning a tx hash!", hash);
        resolve(hash);
      })
      .on("receipt", (receipt: any) => {
        console.log("receipt received", receipt);
      })
      .on("confirmation", (confirmationNumber: any, receipt: any) => {
        console.log({ confirmationNumber, receipt });
      })
      .on("error", error => reject(error));
  });

const VuexModule = createModule({
  strict: false
});

interface AccountParams {
  isUnlocked: boolean;
  isEnabled: boolean;
  selectedAddress: string;
  networkVersion: string;
  onboardingcomplete: boolean;
  chainId: string;
}

export class EthereumModule extends VuexModule.With({
  namespaced: "ethWallet/"
}) {
  loggedInAccount: string = "";

  @mutation setLoggedInAccount(account: string) {
    this.loggedInAccount = account;
  }

  get isAuthenticated() {
    return this.loggedInAccount;
  }

  get ethereum() {
    // @ts-ignore
    return window["ethereum"];
  }

  @action async logout() {
    console.warn("Client cannot logout by itself, log out via MetaMask.");
  }

  @action async connect() {
    try {
      await onboard.walletSelect();
      await onboard.walletCheck();
    } catch (e) {
      console.log(e, "was the error");
      throw new Error(`error: ${e}`);
    }
  }

  @action async accountChange(loggedInAccount: string) {}

  @action async nativeBalanceChange(nativeBalance: string) {}

  @action async checkAlreadySignedIn() {
    const previouslySelectedWallet = localStorage.getItem(selectedWeb3Wallet);

    if (previouslySelectedWallet) {
      await onboard.walletSelect(previouslySelectedWallet);
    }
  }

  @action async getBalance({
    accountHolder,
    tokenContractAddress,
    keepWei = false
  }: {
    accountHolder: EthAddress;
    tokenContractAddress: EthAddress;
    keepWei?: boolean;
  }) {
    if (
      compareString(
        tokenContractAddress,
        "0xc0829421C1d260BD3cB3E0F06cfE2D52db2cE315"
      ) ||
      compareString(tokenContractAddress, ethReserveAddress)
    ) {
      const weiBalance = await web3.eth.getBalance(accountHolder);
      return Number(fromWei(weiBalance));
    } else {
      if (!tokenContractAddress)
        throw new Error("tokenContractAddress is falsy");
      const tokenContract = new web3.eth.Contract(
        // @ts-ignore
        ABISmartToken,
        tokenContractAddress
      );

      const [decimals, weiBalance] = await Promise.all([
        tokenContract.methods.decimals().call() as string,
        tokenContract.methods.balanceOf(accountHolder).call() as string
      ]);
      if (keepWei) return weiBalance;
      return Number(shrinkToken(weiBalance, Number(decimals)));
    }
  }

  @action async tx(params: any) {
    return tx(params);
  }

  @action async transfer({
    floatAmount,
    recipient
  }: {
    floatAmount: string;
    recipient: string;
  }) {
    if (!floatAmount) throw new Error("Float Amount required.");
    if (!isAddress(recipient))
      throw new Error("Recipient must be valid ETH address");
    const weiAmount = toWei(floatAmount);
    const value = toHex(weiAmount);
    const params = [
      {
        from: this.isAuthenticated,
        to: recipient,
        value
      }
    ];
    return this.tx(params);
  }
}
