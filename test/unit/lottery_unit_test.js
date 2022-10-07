const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { localChains, networkConfig } = require("../../helper-hardhat-config")

!localChains.includes(network.name)
    ? describe.skip
    : describe("LOTTERY UNIT TESTS", function () {
          let lottery, vrfCoordinatorV2Mock, deployer, lotteryEntranceFee, interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              // get the deployer account
              deployer = (await getNamedAccounts()).deployer

              // deploy everything which have "all" tag
              await deployments.fixture(["all"])

              // get deployed Lottery contract and attach deployer to it
              lottery = await ethers.getContract("Lottery", deployer)

              // get deployed VRFCoordinatorV2Mock and attach deployer to it
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)

              // get entrance fee
              lotteryEntranceFee = await lottery.getEntranceFee()

              // get interval
              interval = await lottery.getInterval()
          })

          describe("constructor", function () {
              it("Initializes interval correctly", async function () {
                  assert.equal(interval, networkConfig[chainId]["interval"])
              })

              it("Initializes inital lottey state correctly", async function () {
                  const lotteryState = await lottery.getLotteryState()
                  assert.equal(lotteryState.toString(), "0")
              })
          })

          describe("enterToLottery", function () {
              it("Reverts when entered fee is less than entrance fee", async function () {
                  await expect(lottery.enterToLottery()).to.be.revertedWith(
                      "Lottery__NotEnoughEthEntered"
                  )
              })

              it("Records players when they entered", async function () {
                  await lottery.enterToLottery({ value: lotteryEntranceFee })
                  const playerFromContract = await lottery.getPlayer(0)
                  assert.equal(playerFromContract, deployer)
              })

              it("Emmits event on enter", async function () {
                  // parameters : contractName, event Name
                  await expect(lottery.enterToLottery({ value: lotteryEntranceFee })).to.emit(
                      lottery,
                      "LotteryEnter"
                  )
              })

              it("Doesn't allow to enter in lottery when lotteryState is Calculating", async function () {
                  await lottery.enterToLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])

                  await network.provider.send("evm_mine", []) // mining one extrac block

                  await lottery.performUpkeep([])
                  await expect(
                      lottery.enterToLottery({ value: lotteryEntranceFee })
                  ).to.be.revertedWith("Lottery__NotOpen")
              })
          })

          describe("checkUpkeep", function () {
              it("returns false if people haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // We used "callStatic" for simulating the transaction
                  const { upKeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  // not false => true ... as our upKeepNeeded is false we have to test it as
                  assert(!upKeepNeeded)
              })

              it("return false if lottey isn't open", async function () {
                  await lottery.enterToLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // await lottery.performUpkeep("0x")
                  await lottery.performUpkeep([])
                  const lotteryState = await lottery.getLotteryState()
                  const { upKeepNeeded } = await lottery.callStatic.checkUpkeep([])

                  assert.equal(lotteryState.toString(), "1")
                  assert.equal(upKeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async function () {
                  await lottery.enterToLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time has passed, has players, eth, and is open", async function () {
                  await lottery.enterToLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 5])
                  await network.provider.send("evm_mine", [])
                  const { upKeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert(upKeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("it can only run if checkUpkeep is true", async function () {
                  await lottery.enterToLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const tx = await lottery.performUpkeep([])
                  assert(tx)
              })

              it("reverts back if checkUpKeep is false", async function () {
                  await expect(lottery.performUpkeep([])).to.be.revertedWith(
                      "Lottery__UpKeepNotNeeded"
                      //`Lottery_UpKeepNotNeeded(paramerts)` // for adding parameters if you needed
                  )
              })

              it("updates the lottery state, emits the event and calls the vrfCoordinator", async function () {
                  await lottery.enterToLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await lottery.performUpkeep("0x") // emits requestId
                  //const txReceipt = await txResponse.wait(1) // waits 1 block

                  // requestId = await txReceipt.events[1].args.requestID

                  const lotteryState = await lottery.getLotteryState() // updates state

                  assert.equal(lotteryState.toString(), "1") // 0 = open, 1 = calculating

                  await expect(txResponse).to.emit(lottery, "RequestedLotteryWinner")
              })
          })

          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await lottery.enterToLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })

              it("it can only be called after performUpkeep function", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
                  ).to.be.revertedWith("nonexistent request")

                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks a winner, reset the lottery, sends the money to the winner", async function () {
                  const additionalEntrants = 3
                  const startingAccountIndex = 2
                  const accounts = await ethers.getSigners()

                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedLottery = lottery.connect(accounts[i])
                      await accountConnectedLottery.enterToLottery({ value: lotteryEntranceFee })
                  }

                  const statingTimeStamp = await lottery.getLatestTimeStamp()

                  await new Promise(async (resolve, reject) => {
                      lottery.once("WinnerPicked", async () => {
                          console.log("Found the event!")
                          try {
                              const recentWinner = await lottery.getRecentWinner()

                              console.log(recentWinner)

                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              console.log(accounts[3].address)

                              const winnerEndingBalance = await accounts[2].getBalance()

                              const lotteryState = await lottery.getLotteryState()
                              const endingTimeStamp = await lottery.getLatestTimeStamp()
                              const numPlayers = await lottery.getNumberOfPlayers()
                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(lotteryState.toString(), "0")
                              assert(endingTimeStamp > statingTimeStamp)
                              assert(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      lotteryEntranceFee
                                          .mul(additionalEntrants)
                                          .add(lotteryEntranceFee)
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }

                          resolve()
                      })

                      // setting up the listner

                      //we will fire the event, and the listner will pick it up, and resolve
                      const tx = await lottery.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[2].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestID,
                          lottery.address
                      )
                  })
              })
          })
      })
