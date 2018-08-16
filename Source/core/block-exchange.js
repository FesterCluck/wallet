"use strict";
//Consensus
/*
 * TERA.FOUNDATION project
 * Copyright: Yuriy Ivanov, 2017 e-mail: progr76@gmail.com
 * Created by vtools on 18.12.2017.
 */
require('./library');
require('./crypto-library');
const RBTree = require('bintrees').RBTree;
//TestTest(); process.exit(0); return;


//global.FIRST_TIME_BLOCK=0;
global.CAN_START=false;



global.CONSENSUS_TIK_TIME=CONSENSUS_PERIOD_TIME/10;//ms
global.CONSENSUS_CHECK_TIME=CONSENSUS_PERIOD_TIME/20;//ms
const PERIOD_FOR_NEXT_SEND=CONSENSUS_TIK_TIME*3


//timing:
global.BLOCK_DELTA_ACTIVATE=1;
global.TIME_END_EXCHANGE=-3;
global.TIME_START_POW=-4;
global.TIME_START_POW_EXCHANGE=-5;
global.TIME_END_EXCHANGE_POW=-7;
global.TIME_START_SAVE=-8;
global.TIME_START_LOAD=-12;
//global.TIME_START_LOAD_NEW_CHAIN=-9;



//Array:[{body:tr,nonce:uint32,num:byte}],

const FORMAT_DATA_TRANSFER=
    "{\
    SendNumber:uint16,\
    BlockNum:uint,\
    Array:[{body:tr}],\
    MaxPOW:[{BlockNum:uint,AddrHash:hash,PrevHash:hash,TreeHash:hash}],\
    MaxSum:[{BlockNum:uint,SumHash:hash,SumList:[{AddrHash:hash,TreeHash:hash,PrevHash:hash}]}]\
    }";
const WorkStructSend={};


module.exports = class CConsensus extends require("./block-loader")
{
    constructor(SetKeyPair,RunIP,RunPort,UseRNDHeader,bVirtual)
    {
        super(SetKeyPair,RunIP,RunPort,UseRNDHeader,bVirtual)


        this.CurrentBlockNum=0;

        this.RelayMode=false;
        this.SendCount=0;
        this.TreeSendPacket=new RBTree(CompareItemHash);



        if(!global.ADDRLIST_MODE && !this.VirtualMode)
        {

            this.idBlockChainTimer=setInterval(this.StartBlockChain.bind(this),CONSENSUS_PERIOD_TIME-5);

            setInterval(this.DoTransfer.bind(this),CONSENSUS_CHECK_TIME);
        }
    }

    StartBlockChain()
    {
        this.OnStartSecond();

        var CurTime=(GetCurrentTime()-0)
        var NextTime=CurTime+CONSENSUS_PERIOD_TIME;
        NextTime=Math.trunc(NextTime/CONSENSUS_PERIOD_TIME)*CONSENSUS_PERIOD_TIME+50;

        var DeltaForStart=NextTime-CurTime;

        if(DeltaForStart<(CONSENSUS_PERIOD_TIME-5))//корректировка времени запуска
        {
            //ToLog("DeltaForStart="+DeltaForStart+"  CurTime="+CurTime+"  NextTime="+NextTime)
            var self=this;

            if(self.idBlockChainTimer)
                clearInterval(self.idBlockChainTimer);
            self.idBlockChainTimer=0;

            setTimeout(function ()
            {
                self.idBlockChainTimer=setInterval(self.StartBlockChain.bind(self),CONSENSUS_PERIOD_TIME-5);
                self.OnStartSecond();
            },DeltaForStart)
        }


    }


    OnStartSecond()
    {
        //ToLog("Start")
        PrepareStatEverySecond();
        this.AddStatOnTimer();
        this.DoBlockChain();
    }

    CreateBlockContext()
    {
        var Context={};
        Context.AddInfo=AddInfoBlock.bind(Context);

        Context.Active=false;

        Context.TransferFromAddr={};
        Context.LevelsTransfer=[];
        //Context.StrDebug="";
        Context.ErrRun="";
        //Context.PowTree = new RBTree(CompareItemHashPow);
        Context.PowTree = new RBTree(CompareItemTimePow);

        Context.bSave=false;

        Context.PrevHash=undefined;
        Context.TreeHash=undefined;

        Context.MaxPOW={};
        Context.MaxSum={};
        Context.SumPow=0;
        Context.Power=0;
        Context.TrCount=0;
        Context.TrDataPos=0;
        Context.TrDataLen=0;
        Context.Info="Create at:"+GetStrOnlyTimeUTC();



        var Transfer;
        var TransferM2;

        var LocalLevel=0;
        var Levels=this.LevelNodes;
        for(let L=0;L<Levels.length;L++)
        {
            var arr=Levels[L];
            if(arr && arr.length>0)
            {
                Transfer=
                    {
                        LocalLevel:LocalLevel,
                        TreeLevel:L,
                        SendCount:0,
                        GetCount:0,
                        TransferNodes:{},
                        WasGet:false,
                        WasSend:false,
                        MustDeltaTime:CONSENSUS_TIK_TIME*(2+MAX_LEVEL_SPECIALIZATION - L),
                    };
                LocalLevel++;
                Context.LevelsTransfer.push(Transfer);
                Context.StartLevel=Context.LevelsTransfer.length-1;


                for(let j=0;j<arr.length;j++)
                {
                    var Node=arr[j];


                    var Addr=Node.addrStr;
                    if(!Transfer.TransferNodes[Addr])
                    {
                        let Item=
                            {
                                Node:Node,
                                SendCount:0,
                                GetCount:0,
                                addrStr:Addr,
                                TreeLevel:L,
                                GetTiming:3*CONSENSUS_PERIOD_TIME,
                            };
                        Transfer.TransferNodes[Addr]=Item;
                    }
                    Context.TransferFromAddr[Addr]=Transfer;

                    //Context.StrDebug+=" "+L+"-"+Node.port;
                }
            }
        }
        Context.MLevelSend=Context.StartLevel;

        return Context;
    }

    StartConsensus()
    {
         if(!CAN_START)
            return;


        var StartBlockNum=GetCurrentBlockNumByTime();

        if(StartBlockNum<BLOCK_PROCESSING_LENGTH2)
            return;

        this.CurrentBlockNum=StartBlockNum;

        //делаем один из предыдущих блоков активным
        var Block0=this.GetBlockContext(StartBlockNum-BLOCK_DELTA_ACTIVATE);
        if(!Block0.Active)
        {
            AddInfoBlock(Block0,"Activate");
            this.StartBlock(Block0,{});
        }
        else
        {
            AddInfoBlock(Block0,"Was Active");
        }



        this.ToStrBlocks("");



        var Block=this.GetBlockContext(StartBlockNum);
        Block.MLevelSend=Block.StartLevel;
        // if(Block.StartLevel===undefined)
        //     return;
        if(!Block.bSave)
            this.MemPoolToTransfer(Block);
        else
            ToLog("BlockNum="+StartBlockNum+" was saved!")
        this.SendCount=0;

    }

    GetMinTrPow(BlockNum)
    {
        var arrMax,lengthMax=0;
        for(var num=0;num<BLOCK_PROCESSING_LENGTH2;num++)
        {
            var power=0;
            var BlockPrev=this.GetBlock(BlockNum-BLOCK_PROCESSING_LENGTH*3-num)
            if(BlockPrev && BlockPrev.arrContent && BlockPrev.arrContent.length)
            {
                if(BlockPrev.arrContent.length>lengthMax)
                {
                    arrMax=BlockPrev.arrContent;
                    lengthMax=arrMax.length;
                }
            }
        }


        if(arrMax)
        {
            var KK,body;
            if(arrMax.length>=AVG_TRANSACTION_COUNT)
            {
                KK=1;
                body=arrMax[AVG_TRANSACTION_COUNT-1];
            }
            else
            {
                KK=arrMax.length/AVG_TRANSACTION_COUNT;
                body=arrMax[arrMax.length-1];
            }
            var HASH=shaarr(body);
            var power=GetPowPower(HASH);
            power=power*KK;

            //ToLog("=============== BlockNum="+BlockNum+"  power="+power);
            return power;
        }
        else
        {
            //ToLog("=============== BlockNum="+BlockNum+"  power=0000");
            return 0;
        }
    }

    MemPoolToTransfer(Block)
    {
        // if(this.RelayMode)
        //     return;



        //var startTime = process.hrtime();
        var it=this.TreePoolTr.iterator(), item;
        while((item = it.next()) !== null)
        {
            var Res=this.AddTrToBlockQuote(Block,item);
        }
        //ADD_TO_STAT_TIME("IsValidTransaction", startTime);

        this.TreePoolTr.clear();//TODO

     }


    //MAIN EXCHANGE
    //MAIN EXCHANGE
    //MAIN EXCHANGE



    TRANSFER(Info,CurTime)
    {
        var startTime = process.hrtime();
        try
        {
            var Data=BufLib.GetObjectFromBuffer(Info.Data,FORMAT_DATA_TRANSFER,WorkStructSend);
        }
        catch (e)
        {
            TO_ERROR_LOG("TRANSFER",125,"Error parsing Buffer");
            this.AddCheckErrCount(Info.Node,1,"Error parsing Buffer");
            return;
        }

        var Block=this.GetBlockContext(Data.BlockNum);
        if(!Block || Block.StartLevel===undefined)
        {
            this.AddCheckErrCount(Info.Node,1,"Err GetBlockContext");
            return;
        }


        var Key=Info.Node.addrStr;
        var Transfer=Block.TransferFromAddr[Key];
        if(!Transfer)
        {
            this.AddCheckErrCount(Info.Node,1,"Err Transfer");
            return;
        }


        Transfer.WasGet=true;
        //var startTime2 = process.hrtime();
        for(var i=0;i<Data.Array.length;i++)
        {
            this.AddTrToBlockQuote(Block,Data.Array[i]);
        }

        //ADD_TO_STAT_TIME("IsValidTransaction", startTime2);

        this.ToMaxPOWList(Data.MaxPOW);
        this.ToMaxSumList(Data.MaxSum);

        ADD_TO_STAT_TIME("TRANSFER_MS", startTime);

        var Delta=(new Date())-this.StartLoadBlockTime;
        if(Delta>10*1000 && Info.Node.TransferCount>10)
        {
            Info.Node.BlockProcessCount++;
            Info.Node.NextHotDelta=3000;
        }
        Info.Node.TransferCount++;

        Info.Node.LastTimeTransfer=GetCurrentTime()-0;


        var Item=Transfer.TransferNodes[Key];
        Item.GetTiming=GetCurrentTime(Block.DELTA_CURRENT_TIME)-Block.StartTimeNum;
    }

    TrToInfo(Block,Array,StrInfo)
    {
        var Str="";
        for(var i=0;i<Array.length;i++)
        {
            var Item=Array[i];
            this.CheckCreateTransactionHASH(Item);
            Str+=this.GetStrFromHashShort(shaarr(Item.body))+"("+Item.body.length+"),";
            //Str+=this.GetStrFromHashShort(Item.HASH)+"("+Item.TimePow+"),";

        }
        AddInfoBlock(Block,""+StrInfo+": Arr=["+Str+"]");
    }



    DoTransfer()
    {
        if(glStopNode)
            return;
        if(!CAN_START)
            return;




        var MaxPOWList=this.GetMaxPOWList();
        var MaxSumList=this.GetMaxSumList();

        var start=this.CurrentBlockNum-BLOCK_PROCESSING_LENGTH;
        var finish=this.CurrentBlockNum;
        for(var b=start;b<=finish;b++)
        {
            var Block=this.GetBlock(b);
            if(!Block)
                continue;
            if(Block.StartLevel===undefined || Block.MLevelSend===undefined)
                continue;
            if(!Block.Active)
                continue;
            if(Block.MLevelSend<0)
                  continue;
            if(Block.EndExchange)
                continue;


            var Transfer=Block.LevelsTransfer[Block.MLevelSend];

            //Начало периода (такта) - если еще тут не были...
            if(!Transfer.WasSend)
            {
                //вот тут точно начало...

                var arrTr=this.GetArrayFromTree(Block,"DoTransfer");
                var BufData=this.CreateDataBuffer(arrTr,MaxPOWList,MaxSumList,Block.BlockNum);
                this.SendData(Transfer,BufData,1);

                //цикл контроля данных

                if(Block.MLevelSend===0 && Block.MLevelSend<Block.StartLevel)
                {
                    var TreeHash=this.CalcTreeHashFromArrTr(arrTr);
                    for(var L=Block.StartLevel;L>Block.MLevelSend;L--)
                    {
                        var Transfer2=Block.LevelsTransfer[L];
                        if(Transfer2)
                        {
                            this.SendControlData(Transfer2,BufData,Block.BlockNum,TreeHash,1);
                        }
                    }
                }
            }
            Transfer.WasSend=true;
            var bNext=Transfer.WasGet;
            if(!bNext)//check timeout
            {
                var CurTimeNum=GetCurrentTime(Block.DELTA_CURRENT_TIME)-0;
                var DeltaTime=CurTimeNum-Block.StartTimeNum;


                if(DeltaTime>Transfer.MustDeltaTime)
                {
                    bNext=true;
                    Block.ErrRun=""+Transfer.LocalLevel+" "+Block.ErrRun;

                    for(var Addr in Transfer.TransferNodes)
                    {
                        var Item=Transfer.TransferNodes[Addr];
                        //Item.Node.BlockProcessCount--;

                        ADD_TO_STAT("TRANSFER_TIME_OUT");
                        this.AddCheckErrCount(Item.Node,1,"TRANSFER_TIME_OUT");

                    }



                    ADD_TO_STAT("TimeOutLevel");
                }
            }

            if(bNext)
            {

                //Конец периода (такта)
                if(Block.MLevelSend===0)
                {
                    this.CreateTreeHash(Block);
                }


                Block.MLevelSend--;
            }
        }


    }



    SendData(Transfer,BufData,typedata)
    {
        for(var Addr in Transfer.TransferNodes)
        {
            var Item=Transfer.TransferNodes[Addr];
            Transfer.SendCount++;
            this.SendCount++;

            var SendData=
                {
                    "Method":"TRANSFER",
                    "Data":BufData
                };
            this.SendCheck(Item.Node,SendData,typedata);
        }
    }

    SendControlData(Transfer,BufData,BlockNum,TreeHash,typedata)
    {
        for(var Addr in Transfer.TransferNodes)
        {
            var Item=Transfer.TransferNodes[Addr];
            Transfer.SendCount++;
            this.SendCount++;

            var SendData=
                {
                    "Method":"CONTROLHASH",
                    "Context":{BufData:BufData},
                    "Data":
                        {
                            TreeHash:TreeHash,
                            BlockNum:BlockNum,
                        }
                };
            this.SendF(Item.Node,SendData);
        }
    }
    static CONTROLHASH_F()
    {
        return "{TreeHash:hash,BlockNum:uint}";
    }
    CONTROLHASH(Info,CurTime)
    {

        var Data=this.DataFromF(Info);
        var Block=this.GetBlockContext(Data.BlockNum);
        if(!Block || Block.StartLevel===undefined)
            return;

        var arrTr=this.GetArrayFromTree(Block);
        var TreeHash=this.CalcTreeHashFromArrTr(arrTr);
        if(CompareArr(TreeHash,Data.TreeHash)!==0)
        {
            //ToLog("ERR TreeHash");
            this.SendF(Info.Node,
                {
                    "Method":"GETTRANSFER",
                    "Context":Info.Context,
                    "Data":
                        {
                            BlockNum:Block.BlockNum,
                        }
                });
        }
        else
        {

            // this.Send(Info.Node,
            //     {
            //         "Method":"OKCONTROLHASH",
            //         "Context":Info.Context,
            //         "Data":undefined
            //     });
        }
    }
    static GETTRANSFER_F()
    {
        return "{BlockNum:uint}";
    }

    // OKCONTROLHASH(Info,CurTime)
    // {
    // }

    GETTRANSFER(Info,CurTime)
    {
        //var Data=Info.Data;
        var Data=this.DataFromF(Info);

        var Block=this.GetBlockContext(Data.BlockNum);
        if(!Block || Block.StartLevel===undefined)
            return;
        var MaxPOWList=this.GetMaxPOWList();
        var MaxSumList=this.GetMaxSumList();
        var arrTr=this.GetArrayFromTree(Block);
        var BufData=this.CreateDataBuffer(arrTr,MaxPOWList,MaxSumList,Block.BlockNum);
        var SendData=
            {
                "Method":"TRANSFER",
                "Data":BufData
            };
        this.Send(Info.Node,SendData,1);

    }

    CreateDataBuffer(arrTr,MaxPOWList,MaxSumList,BlockNum)
    {
        var Data=
            {
                "SendNumber":1,
                "BlockNum":BlockNum,
                "Array":arrTr,
                "MaxPOW":MaxPOWList,
                "MaxSum":MaxSumList,
            };

        var BufWrite=BufLib.GetBufferFromObject(Data,FORMAT_DATA_TRANSFER,MAX_BLOCK_SIZE+30000,WorkStructSend);
        return BufWrite;
    }



    SendCheck(Node,DATA,typeData)
    {
        this.Send(Node,DATA,typeData);
    }


    //MAX POW
    //MAX POW
    //MAX POW
    //MAX POW



    AddToMaxPOW(Block,item)
    {
        if(Block && item)
        {

            if(!Block.MaxPOW)
                Block.MaxPOW={};
            var POW=Block.MaxPOW;

            var SeqHash=this.GetSeqHash(Block.BlockNum,item.PrevHash,item.TreeHash)
            var hashItem=CalcHashFromArray([SeqHash,item.AddrHash],true)

            if(POW.SeqHash===undefined || CompareArr(hashItem,POW.Hash)<0)
            {
                POW.AddrHash=item.AddrHash;
                POW.Hash=hashItem;
                //POW.port=item.port;

                POW.PrevHash=item.PrevHash;
                POW.TreeHash=item.TreeHash;
                POW.SeqHash=SeqHash;
            }
        }
    }

    GetMaxPOWList()
    {
        var arr=[];
        var start=this.CurrentBlockNum+TIME_START_SAVE;
        var finish=this.CurrentBlockNum+TIME_START_POW;
        for(var b=start;b<finish;b++)
        {
            var Block=this.GetBlock(b);
            if(Block && Block.Prepared && Block.MaxPOW)
            {
                var item=
                    {
                        BlockNum:Block.BlockNum,
                        AddrHash:Block.MaxPOW.AddrHash,
                        PrevHash:Block.MaxPOW.PrevHash,
                        TreeHash:Block.MaxPOW.TreeHash,
                        //port:    Block.MaxPOW.port,
                    };

                arr.push(item);
            }
        }
        return arr;
    }


    ToMaxPOWList(Arr)
    {
        for(var i=0;i<Arr.length;i++)
        {
            var item=Arr[i];

            if(item && item.BlockNum>=this.CurrentBlockNum-BLOCK_PROCESSING_LENGTH && item.BlockNum<this.CurrentBlockNum)
            {
                var Block=this.GetBlock(item.BlockNum);
                this.AddToMaxPOW(Block,item);
            }
        }
    }



    CheckMaxPowOther(Block)
    {
        var POW=Block.MaxPOW;

        if(POW && POW.Hash && CompareArr(POW.Hash,Block.Hash)<0)
        {
            //start load blockchain from net
            var LoadBlockNum=Block.BlockNum;
            var LoadHash=POW.Hash;
            var StrKey=this.GetStrFromHashShort(LoadHash);
            var StrHashWas=this.GetStrFromHashShort(Block.Hash);
            this.StartLoadBlockHeader(LoadHash,LoadBlockNum,"START OTHER:"+StrKey+" WAS:"+StrHashWas,false);
            Block.Info+="\nREQ OTHER:"+StrKey;
        }
        Block.CheckMaxPow=true;
    }


    //MAX SUM LIST
    //MAX SUM LIST
    //MAX SUM LIST


    AddToMaxSum(Block,item)
    {
        if(Block && item)
        {
            if(!Block.MaxSum)
                Block.MaxSum={};
            var POW=Block.MaxSum;

            var SumPow=this.GetSumFromList(item.SumList,Block.BlockNum);
            if(POW.SumHash===undefined || SumPow>POW.SumPow)
            {
                //POW.port=item.port;
                POW.SumPow=SumPow;
                POW.SumHash=item.SumHash;
                POW.SumList=item.SumList;
            }
        }
    }


    GetMaxSumList()
    {
        var arr=[];

        var start=this.CurrentBlockNum+TIME_START_SAVE-2;
        //var start=this.CurrentBlockNum-BLOCK_PROCESSING_LENGTH*2;
        var finish=this.CurrentBlockNum+TIME_START_SAVE;
        // var finish=this.CurrentBlockNum+TIME_START_POW;

        for(var b=start;b<=finish;b++)
        {
            var Block=this.GetBlock(b);
            if(Block && Block.bSave && Block.MaxSum && Block.MaxSum.SumHash)
            {
                var POW=Block.MaxSum;
                var item=
                    {
                        BlockNum:Block.BlockNum,
                        SumHash: POW.SumHash,
                        SumList: POW.SumList,
                        //port:    POW.port,
                    };

                arr.push(item);
            }
        }
        return arr;
    }

    ToMaxSumList(Arr)
    {
        var start=this.CurrentBlockNum+TIME_START_SAVE-2;
        //var start=this.CurrentBlockNum-BLOCK_PROCESSING_LENGTH*2;
        var finish=this.CurrentBlockNum+TIME_START_SAVE;
        // var finish=this.CurrentBlockNum+TIME_START_POW;

        for(var i=0;i<Arr.length;i++)
        {
            var item=Arr[i];
            //if(item && item.BlockNum>=this.CurrentBlockNum+TIME_START_SAVE-1 && item.BlockNum<=this.CurrentBlockNum+TIME_START_SAVE)
            if(item && item.BlockNum>=start && item.BlockNum<=finish)
            {
                var Block=this.GetBlock(item.BlockNum);
                this.AddToMaxSum(Block,item);
            }
        }
    }


    CheckMaxSum(Block)
    {
        var POW=Block.MaxSum;

        var List=this.GetBlockList(Block.BlockNum);
        var SumPow=this.GetSumFromList(List,Block.BlockNum);

        if(POW && POW.SumHash && POW.SumPow>SumPow)
        {
            //start load blockchain from net
            var LoadBlockNum=Block.BlockNum;
            var LoadHash=POW.SumHash;
            var StrKey=this.GetStrFromHashShort(LoadHash);
            this.StartLoadBlockHeader(LoadHash,LoadBlockNum,"START POW:"+POW.SumPow+">"+SumPow+" SH:"+StrKey,true);
            Block.Info+="\nREQ SUMHASH:"+StrKey;
            Block.CheckMaxSum=true;
        }
    }



    //BlockList
    //BlockList
    //BlockList




    GetBlockList(CurBlockNum)
    {
        var arr=[];
        //for(var b=CurBlockNum-1*BLOCK_PROCESSING_LENGTH; b<=CurBlockNum; b++)
        for(var b=CurBlockNum-2*BLOCK_PROCESSING_LENGTH; b<=CurBlockNum; b++)
        {
            var Block=this.GetBlock(b);
            if(Block && Block.bSave)
            {
                var item=
                    {
                        AddrHash:Block.AddrHash,
                        TreeHash:Block.TreeHash,
                        PrevHash:Block.PrevHash,
                    };
                arr.push(item);
            }
            else
            {
                return [];
            }
        }
        return arr;
    }

    GetSumFromList(arr,CurBlockNum)
    {
        var SumPow=0;
        var CountLoad=0;
        var BlockNumStart=CurBlockNum-arr.length+1;
        for(var i=0;i<arr.length;i++)
        {
            var Block=arr[i];
            if(Block)
            {
                var SeqHash=this.GetSeqHash(BlockNumStart+i,Block.PrevHash,Block.TreeHash)
                var Hash=CalcHashFromArray([SeqHash,Block.AddrHash],true);
                SumPow += GetPowPower(Hash);
            }
            else
            {
                break;
            }
        }
        return SumPow;
    }



    //TREE <-> TR
    //TREE <-> TR
    //TREE <-> TR

    GetArrayFromTree(Block)
    {
        if(!Block.PowTree)
            return [];


        var BufLength=0;

        var MaxSize=MAX_BLOCK_SIZE;


        var arr=[];
        var it=Block.PowTree.iterator(), Item;
        while((Item = it.next()) !== null)
        {
            arr.push(Item);

            //контроль размера блока транзакций (обязательно после вставки!!!)

            BufLength+=Item.body.length;
            if(BufLength>MaxSize)
                break;

        };





        return arr;
    }



    AddTrToQuote(PowTree,Tr,MaxTransactionCount)
    {
        this.CheckCreateTransactionHASH(Tr);

        //сначала поиск по полю HASH
        var Tr0=PowTree.find(Tr);
        if(Tr0)
        {
            return 3;//Was send
        }
        else
        {
            PowTree.insert(Tr);
            if(PowTree.size>MaxTransactionCount)
            {
                var maxitem=PowTree.max();
                PowTree.remove(maxitem);

                if(CompareArr(maxitem.HASH,Tr.HASH)===0)
                    return 0;//not add
            }

            return 1;//OK
        }
    }

    //BlOCK QUOTE
    AddTrToBlockQuote(Block,Tr)
    {
        if(Block.PowTree)
        {
            //проверяем валидность транзакции
            if(Block.MinTrPow===undefined)
                 Block.MinTrPow=this.GetMinTrPow(Block.BlockNum);

            var Res=this.IsValidTransaction(Tr,Block.BlockNum);
            if(Res>=1)
            {
                if(!this.RelayMode)
                if(Tr.power<Block.MinTrPow)
                     return -1;

                Res=this.AddTrToQuote(Block.PowTree,Tr,MAX_TRANSACTION_COUNT);
            }
            return Res;

        }
    }



    //BLOCK CONTEXT
    //BLOCK CONTEXT
    //BLOCK CONTEXT

    GetBlockContext(BlockNum)
    {
        if(BlockNum===undefined || !this.IsCorrectBlockNum(BlockNum))
            return undefined;

        var Context=this.GetBlock(BlockNum);
        if(!Context || !Context.StartTimeNum)
        {
            Context=this.CreateBlockContext();
            Context.BlockNum=BlockNum;
            Context.DELTA_CURRENT_TIME=GetDeltaCurrentTime();
            Context.StartTimeNum=BlockNum*CONSENSUS_PERIOD_TIME+START_NETWORK_DATE;


            this.BlockChain[BlockNum]=Context;
        }
        if(!Context.TransferFromAddr)
        {
            Context.TransferFromAddr={};
            Context.LevelsTransfer=[];
        }


        return Context;
    }

    StartBlock(Block)
    {
        Block.Active=true;
    }

    StartBlock0(Block,MapFilter)
    {
        if(!Block.Active)
        {
            Block.DELTA_CURRENT_TIME=GetDeltaCurrentTime();
            //Block.StartTimeNum=GetCurrentTime(Block.DELTA_CURRENT_TIME)-0;//<------- start
            Block.StartTimeNum=Block.BlockNum*CONSENSUS_PERIOD_TIME+START_NETWORK_DATE;
        }

        Block.Active=true;

        var Arr=[];
        for(var Addr in Block.TransferFromAddr)
        {
            Arr.push(Addr);
        }

        var Str="";
        for(var Addr in Block.TransferFromAddr)
        {
            if(MapFilter[Addr])
                continue;

            var Node=this.NodesMap[Addr];
            if(Node && Node.Active)
            {
                Str=Str+" "+Node.port;
                this.SendF(Node,
                    {
                        "Method":"STARTBLOCK",
                        "Data":
                            {
                                BlockNum:Block.BlockNum,
                                AddrArr:Arr
                            }
                    }
                );
            }
        }
        //ToLog("STARTBLOCK: "+Block.BlockNum+" TO:"+Str)
    }
    static STARTBLOCK_F()
    {
        return "{BlockNum:uint,AddrArr:[str64]}"
    }


    STARTBLOCK(Info,CurTime)
    {
        return;

        var Data=this.DataFromF(Info);
        var BlockNum=Data.BlockNum;
        var Arr=Data.AddrArr;

        var Block=this.GetBlockContext(BlockNum);
        if(Block && !Block.Active)
        {
            var Map={};
            Map[Info.Node.addrStr]=true;
            for(var i=0;i<Arr.length;i++)
                Map[Arr[i]]=true;

            //ToLog("OK STARTBLOCK: "+BlockNum)
            this.StartBlock(Block,Map);
        }
    }

    IsCorrectBlockNum(BlockNum)
    {
        var start=this.CurrentBlockNum-BLOCK_PROCESSING_LENGTH;
        var finish=this.CurrentBlockNum;

        if(BlockNum<start || BlockNum>finish)
        {
            return false;
        }

        return true;
    }






    //STR FOR DEBUG
    //STR FOR DEBUG
    //STR FOR DEBUG

    GetStrSendCount(Block)
    {
        //var Block=this.BlockChain[this.CurrentBlockNum-1];
        if(!Block)
            return "";
        var Str="";
        var Count=0;
        for(var L=0;L<Block.LevelsTransfer.length;L++)
        {
            var Transfer=Block.LevelsTransfer[L];
            Str=Str+","+Transfer.SendCount;
            if(typeof Transfer.SendCount==="number")
                Count=Count+Transfer.SendCount;
        }
        return ""+Count+":["+Str.substr(1)+"]";
    }


    GetStrGetCount(Block)
    {
        //var Block=this.BlockChain[this.CurrentBlockNum-1];
        if(!Block)
            return "";
        var Str="";
        var Count=0;
        for(var L=0;L<Block.LevelsTransfer.length;L++)
        {
            var Transfer=Block.LevelsTransfer[L];
            Str=Str+","+Transfer.GetCount;
            Count=Count+Transfer.GetCount;
        }
        return ""+Count+":["+Str.substr(1)+"]";
    }



    ToStrBlocks(DopStr)
    {
        var num=Math.floor(this.CurrentBlockNum/3)*3;
        var start=num-BLOCK_PROCESSING_LENGTH2+2;
        var finish=this.CurrentBlockNum;
        //start=this.CurrentBlockNum-BLOCK_PROCESSING_LENGTH2;

        if(!DopStr)
            DopStr="";
        var Str="";
        for(var b=start;b<=finish;b++)
        {
            var hashStr="";
            var Block=this.GetBlock(b);
            if(Block && Block.ErrRun)
            {
                if(Block.ErrRun)
                    hashStr=Block.ErrRun.substr(0,5);
                else
                if(Block && Block.TreeHash)
                    hashStr="-"+GetHexFromAddres(Block.TreeHash).substr(0,3)+"-";
            }
            else
            if(Block && Block.TreeHash)
            {
                hashStr=GetHexFromAddres(Block.TreeHash).substr(0,5);
            }

            Str=Str+"|"+(hashStr+"     ").substr(0,5);
        }
        Str=Str.substr(1);


        ToInfo(""+finish+" -> "+Str+" "+DopStr);

    }

    PreparePOWHash(Block,bSimplePow)
    {
        if(this.RelayMode)
            bSimplePow=true;

        if(Block.StartMining && !bSimplePow)
            return true;

        var WasHash=Block.Hash;

        if(!Block.TreeHash)
            Block.TreeHash=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];

        var PrevHash=this.GetPrevHash(Block);
        if(!PrevHash)
            return false;
        Block.PrevHash=PrevHash;
        Block.SeqHash=this.GetSeqHash(Block.BlockNum,Block.PrevHash,Block.TreeHash);

        if(bSimplePow)
            this.CreatePOWNew(Block,1);
        else//расчет POW блока (1 сек) - TODO - перенести в отдельный процесс
            this.CreatePOWNew(Block,(1<<MIN_POWER_POW_BL));

        if(!WasHash || CompareArr(WasHash,Block.Hash)!==0)
            Block.Info+="\nHASH:"+this.GetStrFromHashShort(WasHash)+"->"+this.GetStrFromHashShort(Block.Hash);


        Block.Prepared=true;

        if(!bSimplePow)
        {
            Block.StartMining=true;
            this.MiningBlock=Block;
            if(global.SetCalcPOW)
                global.SetCalcPOW(Block);
        }


        return true;
    }



    ReloadTrTable(Block)
    {
        if(!this.IsCorrectBlockNum(Block.BlockNum))
            return;

        var arrTr=this.GetArrayFromTree(Block);
        var bWasError=false;
        for(var i=0;i<arrTr.length;i++)
        {
            if(!this.IsValidTransaction(arrTr[i],Block.BlockNum)>=1)
            {
                bWasError=true;
                break;
            }
        }

        if(!bWasError)
            return;


        this.AddDAppTransactions(Block.BlockNum,arrTr);

        var arrContent=[];
        var arrHASH=[];

        Block.PowTree.clear();

        for(var i=0;i<arrTr.length;i++)
        {
            var Tr=arrTr[i];

            if(this.IsValidTransaction(Tr,Block.BlockNum)>=1)
            {
                if(Block.EndExchange)
                {
                    arrContent.push(Tr.body);
                    arrHASH.push(Tr.HASH);
                }

                this.AddTrToBlockQuote(Block,Tr);

            }
        }


        if(!Block.EndExchange)
            return;

        var Tree=CalcMerklFromArray(arrHASH);
        if(!Block.TreeHash || CompareArr(Block.TreeHash,Tree.Root)!==0)
        {
            Block.Prepared=false;



            Block.TreeHash=Tree.Root;
            Block.arrContent=arrContent;
            Block.TrCount=Block.arrContent.length;
        }
    }
    CalcTreeHashFromArrTr(arrTr)
    {
        var arrHASH=[];
        for(var i=0;i<arrTr.length;i++)
        {
            var Tr=arrTr[i];
            arrHASH.push(Tr.HASH);
        }
        var Tree=CalcMerklFromArray(arrHASH);
        return Tree.Root;
    }
    CalcTreeHashFromArrBody(arrContent)
    {
        if(arrContent)
        {
            var arrHASH=[];
            for(var i=0;i<arrContent.length;i++)
            {
                var HASH=shaarr(arrContent[i]);
                arrHASH.push(HASH);
            }
            var Tree=CalcMerklFromArray(arrHASH);
            return Tree.Root;
        }
        else
        {
            return [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
        }
    }


    CreateTreeHash(Block)
    {
        if(Block.EndExchange)
            return;
        Block.EndExchange=true;
        if(Block.bSave)
            return;



        var PrevBlock=this.GetBlock(Block.BlockNum-1);
        if(PrevBlock && !PrevBlock.EndExchange && !PrevBlock.bSave)
        {
            AddInfoBlock(Block,"Prev Not End Exchange");
            return;
        }

        AddInfoBlock(Block,"End Exchange");

        var arrContent=[];
        var arrHASH=[];

        var arrTr=this.GetArrayFromTree(Block);
        this.AddDAppTransactions(Block.BlockNum,arrTr);


        for(var i=0;i<arrTr.length;i++)
        {
            var Tr=arrTr[i];
            arrContent.push(Tr.body);
            arrHASH.push(Tr.HASH);
        }


        var Tree=CalcMerklFromArray(arrHASH);
        Block.TreeHash=Tree.Root;
        Block.arrContent=arrContent;
        Block.TrCount=Block.arrContent.length;


    }


    DoBlockChain()
    {
        if(glStopNode)
            return;
        if(!CAN_START)
            return;

        this.MiningBlock=undefined;

         if(this.LoadHistoryMode)
            return;

        this.StartConsensus();


        var bWasSave=false;
        var LoadBlockNum;
        var LoadHash;
        var start_save=this.CurrentBlockNum+TIME_START_SAVE;
        for(var i=this.CurrentBlockNum-BLOCK_PROCESSING_LENGTH2; i>BLOCK_PROCESSING_LENGTH2 && i<this.CurrentBlockNum; i++)
        {
            var Block=this.GetBlock(i);
            if(!Block)
            {
                Block=this.GetBlockContext(i);
                if(!Block)
                {
                    continue;
                }
            }

            if(Block.bSave)
            {
                bWasSave=true;
                //check pow Total Hash
                if(i>=this.CurrentBlockNum+TIME_START_LOAD && Block.MaxSum && !Block.CheckMaxSum)
                {
                    AddInfoBlock(Block,"CheckMaxSum");
                    this.CheckMaxSum(Block);
                }

                if(i<=this.CurrentBlockNum-BLOCK_PROCESSING_LENGTH*4)
                {
                    Block.TransferFromAddr=undefined;
                    Block.LevelsTransfer=undefined;
                    Block.mapData=undefined;
                    Block.MaxPOW=undefined;
                    Block.MaxSum=undefined;
                    Block.arrContent=undefined;

                    if(Block.PowTree)
                    {
                        Block.PowTree.clear();
                        Block.PowTree=undefined;
                    }
                }

                continue;
            }
            var PrevBlock=this.GetBlock(i-1);
            if(!PrevBlock)
            {
                AddInfoBlock(Block,"!PrevBlock");
                continue;
            }


            //Обмен
            if(i>=this.CurrentBlockNum+TIME_END_EXCHANGE)
            {
                if(Block.Active)
                    AddInfoBlock(Block,"WAIT EXCHANGE");
                else
                    AddInfoBlock(Block,"NOT ACTIVE");
                continue;
            }
            if(!Block.EndExchange)//Прошли тайминги обмена, но обмен не завершен. Завершаем вручную
            {
                AddInfoBlock(Block,"!EndExchange");
                this.CreateTreeHash(Block);
                this.PreparePOWHash(Block,true);//not start POW
                this.AddToMaxPOW(Block);
            }

            //POW
            if(i===this.CurrentBlockNum+TIME_START_POW)
            {
                if(!Block.EndExchange)
                    this.CreateTreeHash(Block);

                AddInfoBlock(Block,"Start POW!!!");

                this.PreparePOWHash(Block);//start POW
                if(!Block.Prepared)
                    AddInfoBlock(Block,"!!Prepared");
                continue;
            }

            if(!Block.Prepared)//Прошли тайминги расчета POW, но он не рассчитан. Рассчитываем упрощенно вручную
            {
                //AddInfoBlock(Block,"!Prepared");
                this.PreparePOWHash(Block,true);//not start POW
                //this.AddToMaxPOW(Block);
            }



            //Обмен POW
            if(i>=this.CurrentBlockNum+TIME_END_EXCHANGE_POW)
            {
                AddInfoBlock(Block,"WAIT EXCHANGE POW");
                //continue;
            }





            //if(i<=start_save)
            {
                //Пересчитываем предыдуший хеш
                //Сравниваем предудущий хеш нашего блокчейна с лидерами, находим текущий и "другой" лидер
                //Если "другой" лидер имеет сильнее Pow, то загружаем новую цепочку


                //проверяем - может предыдущие блоки были изменены путем загрузки из другой цепочки
                var PrevHash=this.GetPrevHash(Block);
                if(!PrevHash)
                {
                    //нет предыдущих блоков - загрузка из сети
                    if(Block.MaxPOW && Block.MaxPOW.Hash)
                    {
                        LoadBlockNum=Block.BlockNum;
                        LoadHash=Block.MaxPOW.Hash;
                        var StrKey=this.GetStrFromHashShort(LoadHash);
                        if(this.StartLoadBlockHeader(LoadHash,LoadBlockNum,"START1 :"+StrKey,false))
                            AddInfoBlock(Block,"REQUE: "+StrKey);
                    }
                    continue;
                }

                var SeqHash=this.GetSeqHash(Block.BlockNum,PrevHash,Block.TreeHash);
                if(CompareArr(SeqHash,Block.SeqHash)!==0)
                {
                    AddInfoBlock(Block,"New simple pow");
                    this.PreparePOWHash(Block,true);//not start POW
                    this.AddToMaxPOW(Block);
                }






                if(Block.MaxPOW
                    && CompareArr(Block.SeqHash,Block.MaxPOW.SeqHash)===0
                    && CompareArr(Block.AddrHash,Block.MaxPOW.AddrHash)!==0)
                {
                    Block.AddrHash=Block.MaxPOW.AddrHash;
                    Block.Hash=CalcHashFromArray([Block.SeqHash,Block.AddrHash],true);
                }




                //check pow Hash
                if(Block.MaxPOW && !Block.CheckMaxPow && !Block.CheckMaxSum
                    && CompareArr(Block.SeqHash,Block.MaxPOW.SeqHash)!==0)
                {
                    AddInfoBlock(Block,"CheckMaxPow");
                    this.CheckMaxPowOther(Block);
                }


                if(i>start_save)
                    continue;

                if(PrevBlock.bSave && this.BlockNumDB+1 >= Block.BlockNum)
                {

                    // var TimeDelta=this.CurrentBlockNum-Block.BlockNum;
                    // ADD_TO_STAT("MAX:BlockConfirmation",TimeDelta);
                    this.AddToStatBlockConfirmation(Block);

                    if(this.WriteBlockDB(Block))
                    {
                        // var Miner=ReadUintFromArr(Block.AddrHash,0);
                        // if(Miner===GENERATE_BLOCK_ACCOUNT)
                        //     ADD_TO_STAT("MAX:WIN:POWER_MY",GetPowPower(Block.Hash));
                        // ADD_TO_STAT("MAX:POWER_BLOCKCHAIN",GetPowPower(Block.Hash));


                        if(Block.arrContent && Block.arrContent.length)
                            ADD_TO_STAT("MAX:TRANSACTION_COUNT",Block.arrContent.length);

                        AddInfoBlock(Block,"SAVE TO DB: "+this.GetStrFromHashShort(Block.SumHash));
                    }
                    else
                    {
                        AddInfoBlock(Block,"ERROR WRITE DB");
                    }


                    this.AddToMaxSum(Block,
                        {
                            //port:    this.port,
                            SumHash: Block.SumHash,
                            SumList: this.GetBlockList(Block.BlockNum),
                        });

                }
                else
                {
                     AddInfoBlock(Block,"Prev block not saved");
                }

            }

        }

        for(var i=this.CurrentBlockNum-BLOCK_PROCESSING_LENGTH2; i>BLOCK_PROCESSING_LENGTH2 && i<start_save; i++)
        {
            var Block=this.GetBlock(i);
            if(Block && !Block.bSave && Block.TrCount && Block.TreeHash && !IsZeroArr(Block.TreeHash) && !Block.WasSaveDataTree)
            {
                this.SaveDataTreeToDB(Block);
                Block.WasSaveDataTree=1;
                AddInfoBlock(Block,"*SAVE DATA TREE*");
                //ToLog("SAVE DATA TREE: "+Block.BlockNum);
            }
        }


        this.RelayMode=!bWasSave;
        this.FREE_MEM_BLOCKS(this.CurrentBlockNum-BLOCK_COUNT_IN_MEMORY);


    }

}

global.GetCurrentBlockNumByTime=function GetCurrentBlockNumByTime()
{
    var CurTimeNum=GetCurrentTime()-FIRST_TIME_BLOCK-CONSENSUS_PERIOD_TIME/2;
    var StartBlockNum=Math.floor((CurTimeNum+CONSENSUS_PERIOD_TIME)/CONSENSUS_PERIOD_TIME);
    return StartBlockNum;
}

global.TestCreateTr=TestCreateTr;
function TestCreateTr()
{
    const FORMAT_CREATE=
        "{\
        Type:byte,\
        Currency:uint,\
        PubKey:arr33,\
        Description:str40,\
        Adviser:uint,\
        Reserve:arr7,\
        POWCreate:arr12,\
        }";//1+6+33+40+6+7=93


    var TR=
        {
            Type:100,
            Currency:0,
            PubKey:[2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
            Description:"Description",
            Adviser:4,
        };
    var Body=BufLib.GetBufferFromObject(TR,FORMAT_CREATE,1000,{});
    var startTime = process.hrtime();
    var StartData=new Date()-0;
    var nonce=CreateHashBodyPOWInnerMinPower(Body,1000,17);
    var Time = process.hrtime(startTime);

    var power=GetPowPower(shaarr(Body));
    var deltaTime=(Time[0]*1000 + Time[1]/1e6)/1000;//s
    var DeltaData=(new Date()-StartData)/1000;

    ToLog("power="+power+"  nonce="+nonce+" TIME="+deltaTime+" sec"+"  DeltaData="+DeltaData+" sec")
    //return {body:Body};
    return {time1:deltaTime,time2:DeltaData};
}





