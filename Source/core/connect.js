"use strict";
/**
 * Copyright: Yuriy Ivanov, 2017 e-mail: progr76@gmail.com
 * Created by vtools on 14.12.2017.
 */
//connect


const RBTree = require('bintrees').RBTree;
const crypto = require('crypto');
const CNode=require("./node");

global.PERIOD_FOR_RECONNECT=3600*1000;//ms


global.CHECK_DELTA_TIME={Num:0,bUse:0,StartBlockNum:0,EndBlockNum:0,bAddTime:0,DeltaTime:0,Sign:[]};
global.CHECK_POINT={BlockNum:0,Hash:[],Sign:[]};
global.CODE_VERSION={BlockNum:0,addrArr:[],LevelUpdate:0,BlockPeriod:0, VersionNum:UPDATE_CODE_VERSION_NUM,Hash:[],Sign:[],StartLoadVersionNum:0};

global.START_LOAD_CODE={};





const MAX_PERIOD_GETNODES=120*1000;

var MAX_PING_FOR_CONNECT=200;//ms

var TIME_AUTOSORT_GRAY_LIST=5000;//ms
var MAX_TIME_CORRECT=3*3600*1000;//ms

global.MAX_WAIT_PERIOD_FOR_HOT=2*CONSENSUS_PERIOD_TIME;
global.MAX_WAIT_PERIOD_FOR_ACTIVE=10*CONSENSUS_PERIOD_TIME;

const PERIOD_FOR_START_CHECK_TIME=300;//sec




module.exports = class CConnect extends require("./balanser")
{
    constructor(SetKeyPair,RunIP,RunPort,UseRNDHeader,bVirtual)
    {
        super(SetKeyPair,RunIP,RunPort,UseRNDHeader,bVirtual)


        this.StartTime=(new Date())-0;
        this.WasNodesSort=false;
        //this.ReadyConsensus=false;

        this.LevelNodes=[];
        //this.LevelNodesCount=0;

        this.NodesArr=[];
        this.NodesArrUnSort=[];
        this.NodesMap={};//addr->node (1:1) //by addr string
        this.NodesIPMap={};
        this.WasNodesSort=true;

        this.PerioadAfterCanStart=0;

        this.DO_CONSTANT();



        if(!global.ADDRLIST_MODE && !this.VirtualMode)
        {

            setInterval(this.StartPingPong.bind(this),1000);
            setInterval(this.StartCheckConnect.bind(this),1000);
            setInterval(this.DeleteNodeFromActiveByTimer.bind(this),MAX_WAIT_PERIOD_FOR_ACTIVE);


            //setInterval(this.StartReconnect.bind(this),60*1000);
         }

        setInterval(this.NodesArrSort.bind(this),TIME_AUTOSORT_GRAY_LIST);


    }
    DO_CONSTANT()
    {
        this.CommonKey=GetHexFromArr(WALLET.HashProtect(global.COMMON_KEY));

        this.KeyToNode=shaarr(global.COMMON_KEY);
        this.NameToNode=this.ValueToXOR("Name",global.NODES_NAME);
    }

    StartConnectTry(Node)
    {
        var Delta=(new Date)-Node.ConnectStart;

        if(Delta>=Node.NextConnectDelta && this.IsCanConnect(Node))
        {
            if(!GetSocketStatus(Node.Socket))
            {
                Node.ConnectStart=(new Date)-0;
                if(Delta<60*1000)
                    Node.NextConnectDelta=Node.NextConnectDelta*2;
                else
                    Node.NextConnectDelta=Node.NextConnectDelta*1.2;

                Node.CreateConnect();
            }
        }
    }


    FindRunNodeContext(addrArr,ip,port,bUpdate)
    {
        var Node,addrStr;

        addrStr=GetHexFromAddres(addrArr);
        Node=this.NodesMap[addrStr];
        if(!Node)
        {
            var key=""+ip+":"+port;
            Node=this.NodesIPMap[key];
            if(!Node)
            {
                Node=this.GetNewNode(addrStr,ip,port)
            }
        }

        if(Node.addrStr!==addrStr)
        {
            delete this.NodesMap[Node.addrStr];
            this.NodesMap[addrStr]=Node;
            Node.addrStrTemp=undefined;
        }


        Node.addrArr=addrArr;
        Node.addrStr=addrStr;
        Node.ip=ip.trim();
        Node.port=port;
        return Node;
    }
    CheckNodeMap(Node)
    {
        if(Node.addrStrTemp && Node.addrStrTemp!==Node.addrStr)
        {
            delete this.NodesMap[Node.addrStrTemp];
            this.NodesMap[Node.addrStr]=Node;
            Node.addrStrTemp=undefined;
        }
    }




    StartHandshake(Node)
    {
        return this.StartConnectTry(Node)
    }




    /*
    Ping--->
    time
    <---Pong
     */
    StartPingPong()
    {
        if(glStopNode)
            return;

        if(global.CAN_START)
            this.PerioadAfterCanStart++;


        //Time correct
        this.TimeDevCorrect();


        var arr=SERVER.GetActualNodes();
        for(var i=0;i<arr.length;i++)
        {
            var Node=arr[i];
            if(this.IsCanConnect(Node) && !Node.IsAddrList)
            {
                if(Node.Hot)
                    Node.NextPing=1000;

                var Delta=(new Date)-Node.PingStart;
                if(Delta>=Node.NextPing)
                {


                    Node.PingStart=(new Date)-0;
                    Node.NextPing=Node.NextPing*1.5;


                    if(!Node.PingNumber)
                        Node.PingNumber=0;
                    Node.PingNumber++;


                    var Context={"StartTime":GetCurrentTime(0),PingNumber:Node.PingNumber};
                    this.SendF(Node,
                        {
                            "Method":"PING",
                            "Context":Context,
                            "Data":this.GetPingData(Node)
                        }
                    );
                    //Node.DeltaTime=undefined;
                }
            }
        }
    }
    GetPingData(Node)
    {
        var GrayAddres=0;
        if(global.NET_WORK_MODE && !NET_WORK_MODE.UseDirectIP)
            GrayAddres=1;

        var BlockNumHash=GetCurrentBlockNumByTime()-BLOCK_PROCESSING_LENGTH2;
        var AccountsHash=DApps.Accounts.GetHashOrUndefined(BlockNumHash);

        var CheckPointHashDB=[];
        if(CHECK_POINT.BlockNum)
        {
            var Block=this.ReadBlockHeaderFromMapDB(CHECK_POINT.BlockNum);
            if(Block)
                CheckPointHashDB=Block.Hash;
        }
        var HashDB=[];
        if(this.BlockNumDB>0)
        {
            var Block=this.ReadBlockHeaderFromMapDB(this.BlockNumDB);
            if(Block)
                HashDB=Block.Hash;
        }

        var Level=this.AddrLevelNode(Node);
        var arr=this.LevelNodes[Level];
        var LevelCount=0;
        if(arr)
        {
            LevelCount=arr.length;
        }

        var StopGetBlock=global.STOPGETBLOCK;
        if(!StopGetBlock && this.BusyLevel)
        {
            if(Node.BlockProcessCount<=this.BusyLevel)
                StopGetBlock=1;

        }


        var Ret=
            {
                VERSIONMAX:DEF_VERSION,
                FIRST_TIME_BLOCK:0,
                PingVersion:3,
                GrayConnect:GrayAddres,
                Reserve2:0,
                AutoCorrectTime:AUTO_COORECT_TIME,
                LevelCount:LevelCount,
                Time:(GetCurrentTime()-0),
                BlockNumDB:this.BlockNumDB,
                LoadHistoryMode:this.LoadHistoryMode,
                CanStart:global.CAN_START,
                CheckPoint:CHECK_POINT,
                Reserv3:[],
                Key:this.KeyToNode,
                Name:this.NameToNode,
                TrafficFree:this.SendTrafficFree,
                AccountBlockNum:BlockNumHash,
                AccountsHash:AccountsHash,
                MemoryUsage:Math.trunc(process.memoryUsage().heapTotal/1024/1024),
                CheckDeltaTime:CHECK_DELTA_TIME,
                CodeVersion:CODE_VERSION,
                IsAddrList:global.ADDRLIST_MODE,
                CheckPointHashDB:CheckPointHashDB,
                NodesLevelCount:0,//this.GetNodesLevelCount(),
                HashDB:HashDB,
                StopGetBlock:StopGetBlock,
                Reserve:[],
            };

        return Ret;
    }

    static PING_F(bSend)
    {
        return "{\
            VERSIONMAX:str15,\
            PingVersion:byte,\
            GrayConnect:byte,\
            Reserve2:byte,\
            AutoCorrectTime:byte,\
            LevelCount:uint16,\
            Time:uint,\
            BlockNumDB:uint,\
            LoadHistoryMode:byte,\
            CanStart:byte,\
            CheckPoint:{BlockNum:uint,Hash:hash,Sign:arr64},\
            Reserv3:arr38,\
            Key:arr32,\
            Name:arr32,\
            TrafficFree:uint,\
            AccountBlockNum:uint,\
            AccountsHash:hash,\
            MemoryUsage:uint,\
            CheckDeltaTime:{Num:uint,bUse:byte,StartBlockNum:uint,EndBlockNum:uint,bAddTime:byte,DeltaTime:uint,Sign:arr64},\
            CodeVersion:{BlockNum:uint,addrArr:arr32,LevelUpdate:byte,BlockPeriod:uint,VersionNum:uint,Hash:hash,Sign:arr64},\
            IsAddrList:byte,\
            CheckPointHashDB:hash,\
            NodesLevelCount:uint16,\
            HashDB:hash,\
            StopGetBlock:uint,\
            Reserve:arr40,\
            }";
    }

    static PONG_F(bSend)
    {
       return CConnect.PING_F(bSend);
    }

    PING(Info,CurTime)
    {
        this.DoPingData(Info,1);

        this.SendF(Info.Node,
            {
                "Method":"PONG",
                "Context":Info.Context,
                "Data":this.GetPingData(Info.Node)
            }
        );
    }

    DoPingData(Info,bCheckPoint)
    {
        var Node=Info.Node;
        var Data=this.DataFromF(Info);

        Info.Node.LevelCount=Data.LevelCount;
        Info.Node.VERSIONMAX=Data.VERSIONMAX;

        if(Data.PingVersion>=3 && global.COMMON_KEY && CompareArr(Data.Key,this.KeyToNode)===0)
        {
            Node.Name=this.ValueFromXOR(Node,"Name",Data.Name);
        }
        else
        {
            Node.Name="";
        }

        Node.INFO=Data;
        Node.INFO.WasPing=1;
        Node.LevelCount=Data.LevelCount;
        Node.LoadHistoryMode=Data.LoadHistoryMode;
        // if((Data.LoadHistoryMode || !Data.CanStart) && Node.Hot)
        // {
        //     this.DeleteNodeFromHot(Node);
        // }

        Node.LastTime=GetCurrentTime()-0;
        Node.NextConnectDelta=1000;//connection is good
        Node.GrayConnect=Data.GrayConnect;
        Node.StopGetBlock=Data.StopGetBlock;


        //Check point
        if(bCheckPoint)
        {
            this.CheckCheckPoint(Data,Info.Node);
            this.CheckCodeVersion(Data,Info.Node);
            this.CheckDeltaTime(Data,Info.Node);
        }
    }


    PONG(Info,CurTime)
    {
        var Data=this.DataFromF(Info);
        var Node=Info.Node;

        //load time from meta
        if(!Info.Context)
            return;
        if(!Info.Context.StartTime)
            return;
        if(Info.Context.PingNumber!==Node.PingNumber)
            return;

        this.DoPingData(Info,0);


        var DeltaTime=GetCurrentTime(0)-Info.Context.StartTime;
        Node.SumDeltaTime+=DeltaTime;
        Node.CountDeltaTime++;
        Node.DeltaTime=Math.trunc(Node.SumDeltaTime/Node.CountDeltaTime);



        //Check point
        this.CheckCheckPoint(Data,Info.Node);



        if(!START_LOAD_CODE.StartLoadVersionNum)
            START_LOAD_CODE.StartLoadVersionNum=0;


        //{BlockNum:0,addrArr:[],LevelUpdate:0,BlockPeriod:0, VersionNum:UPDATE_CODE_VERSION_NUM,Hash:[],Sign:[],StartLoadVersionNum:0};

        this.CheckCodeVersion(Data,Info.Node);


        if(!global.CAN_START)
        {
            ToLog("DeltaTime="+DeltaTime+" ms  -  "+NodeInfo(Node));
            if(DeltaTime>MAX_PING_FOR_CONNECT)
                ToLog("DeltaTime="+DeltaTime+">"+MAX_PING_FOR_CONNECT+" ms  -  "+NodeInfo(Node))
        }



        var Times;
        if(DeltaTime<=MAX_PING_FOR_CONNECT)
        {

            //расчет времени удаленной ноды
            Times=Node.Times;
            if(!Times || Times.Count>=10)
            {
                Times={SumDelta:0,Count:0,AvgDelta:0,Arr:[]};
                Node.Times=Times;
            }

            var Time1=Data.Time;
            var Time2=GetCurrentTime();
            var Delta2=-(Time2-Time1-DeltaTime/2);


            Times.Arr.push(Delta2);
            Times.SumDelta+=Delta2;
            Times.Count++;
            Times.AvgDelta=Times.SumDelta/Times.Count;

            //AvgDelta - берем минимальное по абс значению из всех попыток
            if(Times.Count>=2)
            {
                //Node.AvgDelta=Times.AvgDelta;
                Times.Arr.sort(function (a,b) {return Math.abs(a)-Math.abs(b)});
                Node.AvgDelta=Times.Arr[0];
            }

            if(global.AUTO_COORECT_TIME)
            {
                this.CorrectTime();
            }
        }
        else
        {
            //ToLog("DeltaTime="+DeltaTime+" ms  -  "+NodeInfo(Node)+"    PingNumber:"+Info.Context.PingNumber+"/"+Node.PingNumber);
        }
        ADD_TO_STAT("MAX:PING_TIME",DeltaTime);

        if(!global.CAN_START)
        if(Times && Times.Count>=1 && Times.AvgDelta<=200)
        {
            ToLog("****************************************** CAN_START")
            global.CAN_START=true;
        }

        this.CheckDeltaTime(Data,Info.Node);
    }

    CheckCheckPoint(Data,Node)
    {
        if(!CREATE_ON_START)
            if(Data.CheckPoint.BlockNum && Data.CheckPoint.BlockNum>CHECK_POINT.BlockNum)
            {
                var SignArr=arr2(Data.CheckPoint.Hash,GetArrFromValue(Data.CheckPoint.BlockNum));
                if(CheckDevelopSign(SignArr,Data.CheckPoint.Sign))
                {
                    ToLog("Get new CheckPoint = "+Data.CheckPoint.BlockNum);

                    //clear Node.NextPing
                    this.ResetNextPingAllNode();


                    global.CHECK_POINT=Data.CheckPoint;
                    var Block=this.ReadBlockHeaderDB(CHECK_POINT.BlockNum);
                    if(Block && CompareArr(Block.Hash,CHECK_POINT.Hash)!==0)
                    {
                        //reload chains
                        this.BlockNumDB=CHECK_POINT.BlockNum-1;
                        this.TruncateBlockDB(this.BlockNumDB);
                        this.StartLoadHistory(Node);
                    }
                }
                else
                {
                    Node.NextConnectDelta=60*1000;
                    ToLog("Error Sign CheckPoint="+Data.CheckPoint.BlockNum+" from "+NodeInfo(Node));
                    this.AddCheckErrCount(Node,1,"Error Sign CheckPoint");
                }
            }
    }
    CheckDeltaTime(Data,Node)
    {
        if(global.AUTO_COORECT_TIME)
        if(global.CAN_START && !CREATE_ON_START)
        {
            if(Data.CheckDeltaTime.Num>CHECK_DELTA_TIME.Num)
            {
                var SignArr=this.GetSignCheckDeltaTime(Data.CheckDeltaTime);
                if(CheckDevelopSign(SignArr,Data.CheckDeltaTime.Sign))
                {
                    //ToLog("Get new CheckDeltaTime: "+JSON.stringify(Data.CheckDeltaTime));
                    global.CHECK_DELTA_TIME=Data.CheckDeltaTime;
                }
                else
                {
                    Node.NextConnectDelta=60*1000;
                    ToLog("Error Sign CheckDeltaTime Num="+Data.CheckDeltaTime.Num+" from "+NodeInfo(Node));
                    this.AddCheckErrCount(Node,1,"Error Sign CheckDeltaTime");
                }
            }
        }
    }

    CheckCodeVersion(Data,Node)
    {
        var CodeVersion=Data.CodeVersion;
        Node.VersionNum=CodeVersion.VersionNum;
        if(CodeVersion.VersionNum>=MIN_CODE_VERSION_NUM)
        {
            Node.VersionOK=true;
        }
        else
        {
            Node.VersionOK=false;
        }

        if(Node.VersionOK && !Data.LoadHistoryMode)
        {
            Node.CanHot=true;

            if(CHECK_POINT.BlockNum && Data.CheckPoint.BlockNum)
                if(CHECK_POINT.BlockNum!==Data.CheckPoint.BlockNum || CompareArr(CHECK_POINT.Hash,Data.CheckPoint.Hash)!==0)
                {
                    Node.CanHot=false;
                    Node.NextConnectDelta=60*1000;
                }
        }
        else
        {
            Node.CanHot=false;
            if(!Node.VersionOK)
            {
                //ToLog("ERR VersionNum="+CodeVersion.VersionNum+" from "+NodeInfo(Node));
                Node.NextConnectDelta=60*1000;
            }
        }


        var bLoadVer=0;
        if(CodeVersion.BlockNum && (CodeVersion.BlockNum<=GetCurrentBlockNumByTime() || CodeVersion.BlockPeriod===0) && CodeVersion.BlockNum > CODE_VERSION.BlockNum
            && !IsZeroArr(CodeVersion.Hash)
            && (CodeVersion.VersionNum>CODE_VERSION.VersionNum && CodeVersion.VersionNum>START_LOAD_CODE.StartLoadVersionNum
                || CodeVersion.VersionNum===CODE_VERSION.VersionNum && IsZeroArr(CODE_VERSION.Hash)))//was restart
        {
            bLoadVer=1;
        }


        if(bLoadVer)
        {
            var Level=AddrLevelArrFromBegin(this.addrArr,CodeVersion.addrArr);
            if(CodeVersion.BlockPeriod)
            {
                var Delta=GetCurrentBlockNumByTime()-CodeVersion.BlockNum;
                Level+=Delta/CodeVersion.BlockPeriod;
            }

            if(Level>=CodeVersion.LevelUpdate)
            {
                var SignArr=arr2(CodeVersion.Hash,GetArrFromValue(CodeVersion.VersionNum));
                if(CheckDevelopSign(SignArr,CodeVersion.Sign))
                {
                    ToLog("Get new CodeVersion = "+CodeVersion.VersionNum+" HASH:"+GetHexFromArr(CodeVersion.Hash).substr(0,20));

                    if(CodeVersion.VersionNum>CODE_VERSION.VersionNum && CodeVersion.VersionNum>START_LOAD_CODE.StartLoadVersionNum)
                    {
                        this.StartLoadCode(Node,CodeVersion);
                    }
                    else
                    //if(CodeVersion.VersionNum===CODE_VERSION.VersionNum && IsZeroArr(CODE_VERSION.Hash))//was restart
                    {
                        CODE_VERSION=CodeVersion;
                    }
                }
                else
                {
                    ToLog("Error Sign CodeVersion="+CodeVersion.VersionNum+" from "+NodeInfo(Node)+" HASH:"+GetHexFromArr(CodeVersion.Hash).substr(0,20));
                    ToLog(JSON.stringify(CodeVersion));
                    this.AddCheckErrCount(Node,1,"Error Sign CodeVersion");
                    Node.NextConnectDelta=60*1000;
                }
            }
        }
    }


    GetSignCheckDeltaTime(Data)
    {
        var Buf=BufLib.GetBufferFromObject(Data,"{Num:uint,bUse:byte,StartBlockNum:uint,EndBlockNum:uint,bAddTime:byte,DeltaTime:uint}",1000,{});
        return shaarr(Buf);
    }

    ResetNextPingAllNode()
    {
        var arr=SERVER.GetActualNodes();
        for(var i=0;i<arr.length;i++)
        {
            var Node2=arr[i];
            if(Node2 && Node2.NextPing>5*1000)
                Node2.NextPing=5*1000;
        }
    }






    StartDisconnectHot(Node,StrError)
    {
        this.Send(Node,
            {
                "Method":"DISCONNECTHOT",
                "Context":{},
                "Data":StrError
            },STR_TYPE
        );
        //this.DeleteNodeFromActive(Node);
    }

    DISCONNECT(Info,CurTime)
    {
        ToLogNet("FROM "+NodeInfo(Info.Node)+" DISCONNECT: "+Info.Data);
        this.DeleteNodeFromActive(Info.Node);
        this.DeleteNodeFromHot(Info.Node);
        ADD_TO_STAT("DISCONNECT");
    }
    DISCONNECTHOT(Info,CurTime)
    {
        this.DeleteNodeFromHot(Info.Node);
        ADD_TO_STAT("DISCONNECTHOT");
        ToLogNet("FROM "+NodeInfo(Info.Node)+" DISCONNECTHOT: "+Info.Data);
    }



    StartGetNodes(Node)
    {
        if(glStopNode)
            return;

        var Delta=(new Date)-Node.GetNodesStart;

        if(Delta>=Node.NextGetNodesDelta)
        {
            Node.GetNodesStart=(new Date)-0;
            Node.NextGetNodesDelta=Math.min(Node.NextGetNodesDelta*2,MAX_PERIOD_GETNODES);
            if(global.ADDRLIST_MODE)
                Node.NextGetNodesDelta=MAX_PERIOD_GETNODES;

            this.Send(Node,
                {
                    "Method":"GETNODES",
                    "Context":{},
                    "Data":undefined
                }
            );
        }
    }

    GETNODES(Info,CurTime)
    {
        this.SendF(Info.Node,
            {
                "Method":"RETGETNODES",
                "Context":Info.Context,
                "Data":{
                            arr:this.GetDirectNodesArray(false),
                            IsAddrList:global.ADDRLIST_MODE,
                        }
            },MAX_NODES_RETURN*150+300
        );
    }
    static RETGETNODES_F()
    {
        return "{arr:[\
                        {\
                            addrStr:str64,\
                            ip:str30,\
                            port:uint16,\
                            Reserve:uint16,\
                            LastTime:uint,\
                            DeltaTime:uint\
                        }\
                    ],\
                    IsAddrList:byte}";
    }


    RETGETNODES(Info,CurTime)
    {
        var Data=this.DataFromF(Info);
        var arr=Data.arr;
        if(arr && arr.length>0)
        {
            for(var i=0;i<arr.length;i++)
            {
                this.AddToArrNodes(arr[i],true);
            }
        }
        Info.Node.IsAddrList=Data.IsAddrList;

        //ToLog("RETGETNODES length="+arr.length);
    }


    GetNewNode(addrStr,ip,port)
    {
        var Node=new CNode(addrStr,ip,port);
        this.AddToArrNodes(Node,false);

        return Node;
    }

    IsCanConnect(Node)
    {
        if(Node.addrStr===this.addrStr
            || this.NodeInBan(Node)
            || Node.Delete
            || Node.Self
            || Node.DoubleConnection)
            return false;

        if(Node.ip===this.ip && Node.port===this.port)
            return false;

        if(this.addrStr===Node.addrStr)
            return false;

        return true;
    }

    GetDirectNodesArray(bAll)
    {
        var ret=[];
        var Value=
            {
                addrStr:this.addrStr,
                ip:this.ip,
                port:this.port,
                LastTime:0,
                DeltaTime:0,
                Hot:true,
                BlockProcessCount:0
            };
        ret.push(Value);
        if(global.NET_WORK_MODE && (!NET_WORK_MODE.UseDirectIP))
            return ret;



        var len=this.NodesArr.length;
        var UseRandom=0;
        if(len>MAX_NODES_RETURN && !bAll)
        {
            UseRandom=1;
            len=MAX_NODES_RETURN;
        }
        var mapWasAdd={};

        var CurTime=GetCurrentTime();
        for(var i=0;i<len;i++)
        {
            var Item;
            if(UseRandom)
            {
                Item=this.NodesArr[random(this.NodesArr.length)];
                if(mapWasAdd[Item.addrStr])
                {
                    continue;
                }
                mapWasAdd[Item.addrStr]=1;
            }
            else
            {
                Item=this.NodesArr[i];
            }


            if(!this.IsCanConnect(Item))
                continue;
            if(Item.GrayConnect)
                continue;

            // if(!global.ADDRLIST_MODE && !Item.LastTime)
            //      continue;

            if(Item.BlockProcessCount<0)
                continue;

            if(Item.LastTime-0 < CurTime-3600*1000 && Item.BlockProcessCount<500000)
                continue;

            var Value=
            {
                addrStr:Item.addrStr,
                ip:Item.ip,
                port:Item.port,
                FirstTime:Item.FirstTime,
                FirstTimeStr:Item.FirstTimeStr,
                LastTime:Item.LastTime-0,
                DeltaTime:Item.DeltaTime,
                Hot:Item.Hot,
                BlockProcessCount:Item.BlockProcessCount,
            };

            ret.push(Value);
        }

        return ret;
    }

    AddToArrNodes(Item,bFromGetNodes)
    {
        if(Item.addrStr==="" || Item.addrStr===this.addrStr)
            return;
        var Node;
        var key=Item.ip+":"+Item.port;
        Node=this.NodesMap[Item.addrStr];
        if(!Node)
        {
            Node=this.NodesIPMap[key];
        }

        if(!Node)
        {

            if(Item instanceof CNode)
                Node=Item;
            else
                Node=new CNode(Item.addrStr,Item.ip,Item.port);


            //добавляем новые поля
            Node.Stage=1;
            Node.id=this.NodesArr.length;
            Node.addrArr=GetAddresFromHex(Node.addrStr);
            //Node.addrStr2=AddrTo2(Node.addrStr);


            this.NodesMap[Node.addrStr]=Node;
            this.NodesArr.push(Node);
            this.NodesArrUnSort.push(Node);

            //ToLog("NEW: "+Node.ip+":"+Node.port)

            ADD_TO_STAT("AddToNodes");
        }
        if(bFromGetNodes)
        {
            //Node.DirectIP=true;
        }

        this.NodesMap[Node.addrStr]=Node;
        this.NodesIPMap[key]=Node;

        if(Node.addrArr && CompareArr(Node.addrArr,this.addrArr)===0)
        {
            Node.Self=true;
        }

        if(Item.BlockProcessCount)
            Node.BlockProcessCount=Item.BlockProcessCount;
        if(Item.FirstTime)
        {
            Node.FirstTime=Item.FirstTime;
            Node.FirstTimeStr=Item.FirstTimeStr;
        }



        return Node;
    }

    NodesArrSort()
    {
        this.NodesArr.sort(SortNodeBlockProcessCount);

        if((new Date())-this.StartTime > 120*1000)
        {
            var arr=this.GetDirectNodesArray(true).slice(1);
            SaveParams(GetDataPath("nodes.lst"),arr);
        }
    }


    LoadNodesFromFile()
    {
        var arr=LoadParams(GetDataPath("nodes.lst"),[]);
        arr.sort(SortNodeBlockProcessCount);

        for(var i=0;i<arr.length;i++)
        {
            if(arr[i].LastTime)
            {
                if(typeof arr[i].LastTime === "string")
                    arr[i].LastTime=0;

                this.AddToArrNodes(arr[i],true);
            }
        }
    }








    StartAddLevelConnect(Node)
    {
        if(this.LoadHistoryMode || !global.CAN_START)
            return;

        if(!Node.Stage)
            Node.Stage=0;
        Node.Stage++;

        if(Node.Stage>10 && Node.Active)
        {
            this.DeleteNodeFromActive(Node);
        }

        ADD_TO_STAT("NETCONFIGURATION");


        if(Node.Active && Node.CanHot)
        this.Send(Node,
            {
                "Method":"ADDLEVELCONNECT",
                "Context":{},
                "Data":undefined
            }
        );
    }


    ADDLEVELCONNECT(Info,CurTime)
    {
        var ret;
        var Count;

        if(this.LoadHistoryMode || !global.CAN_START)
            return;

        var Level=this.AddrLevelNode(Info.Node);
        var arr=this.LevelNodes[Level];
        if(!arr)
            Count=0;
        else
            Count=arr.length;

        var bAdd=0;
        if(!Info.Node.CanHot || Count>=MAX_CONNECT_CHILD)
        {
            if(Count>=MAX_CONNECT_CHILD && Info.Node.CanHot)
            {
                arr.sort(SortNodeBlockProcessCount);
                var NodeLast=arr[arr.length-1];
                if(NodeLast.BlockProcessCount<Info.Node.BlockProcessCount)
                {
                    ADD_TO_STAT("DeleteFromMaxBlockProcessCount");
                    this.DeleteNodeFromHot(NodeLast);
                    this.StartDisconnectHot(NodeLast,"DeleteFromMaxBlockProcessCount");
                    Count--;
                    bAdd=1;
                }
            }
        }
        else
        {
            bAdd=1;
        }

        if(bAdd)
        {
            this.AddLevelConnect(Info.Node);
            ret={result:1,Count:Count};
        }
        else
        {
            ret={result:0,Count:Count};
        }



        this.SendF(Info.Node,
            {
                "Method":"RETADDLEVELCONNECT",
                "Context":Info.Context,
                "Data":ret
            }
        );
    }
    static RETADDLEVELCONNECT_F()
    {
        return "{result:byte,Count:uint}";
    }

    RETADDLEVELCONNECT(Info,CurTime)
    {
        var Data=this.DataFromF(Info);

        if(Data.result===1)
        {
            this.AddLevelConnect(Info.Node);
            //this.CalcStatus(false);
        }
        else
        {
            Info.Node.Stage++
        }

        Info.Node.CountChildConnect=Data.Count;
    }




    StartCheckConnect()
    {
        if(glStopNode)
            return;
        if(this.LoadHistoryMode || !global.CAN_START)
            return;


        var CurTime=GetCurrentTime();


        //проверяем существующие соединения - время последнего обмена (может был дисконнект?)
        for(var i=0;i<this.LevelNodes.length;i++)
        {
            var arr=this.LevelNodes[i];
            for(var n=0;arr && n<arr.length;n++)
            {
                var Node=arr[n];
                if(!Node.LastTime)
                    Node.LastTime=CurTime-0;

                var DeltaTime=CurTime-Node.LastTime;
                if(!Node.Hot  || !Node.CanHot || DeltaTime>MAX_WAIT_PERIOD_FOR_HOT)
                {
                    //ToLog("Node.Hot="+Node.Hot+" DeltaTime="+DeltaTime);
                    this.DeleteNodeFromHot(Node);
                    ADD_TO_STAT("StartCheckConnect");
                    this.StartDisconnectHot(Node,"StartCheckConnect:D="+DeltaTime);
                    break;
                }
            }
        }

        //проверяем может ноды могут соединитьcя по другому
        for(var i=0;i<this.LevelNodes.length;i++)
        {
            this.CheckDisconnectChilds(i);
        }

        //проверяем новые соединения (может сеть уже увеличилась?)

        if(0)
        for(var L=0;L<=MAX_LEVEL_SPECIALIZATION;L++)
        {
            var arr=this.LevelNodes[i];
            if(!arr || arr.length!==1)
            {
                var Res=this.FindPair(L);
            }
        }


        var StatLevels=this.CalcLevels();
        for(var i=0;i<StatLevels.length;i++)
        {
            var Stat=StatLevels[i];
            if(!Stat)
                continue;

            var arr=this.LevelNodes[i];
            if(arr && arr.length>=MIN_CONNECT_CHILD)
                continue;


            //требуется соединение
            var Node=Stat.Node;
            this.StartAddLevelConnect(Node);
        }



    }
    DeleteNodeFromActiveByTimer()
    {
        if(glStopNode)
            return;

        var CurTime=GetCurrentTime();

        var arr=SERVER.NodesArr;
        for(var i=0;i<arr.length;i++)
        {
            var Node=arr[i];
            if(Node.Active && GetSocketStatus(Node.Socket)<100)
            {
                var Delta=CurTime-Node.LastTime;
                if(Delta>MAX_WAIT_PERIOD_FOR_ACTIVE)
                {
                    ToLog("Delete node from Active by timer: "+NodeInfo(Node))
                    this.DeleteNodeFromActive(Node);
                }
            }
        }
    }


    CalcLevels()
    {
        var Levels=[];
        for(var n=0;n<this.NodesArr.length;n++)
        {
            var Child=this.NodesArr[n];

            if(Child.BlockProcessCount<100 && Child.CountDeltaTime<=2)
                continue;
            if(Child.DeltaTime>=MAX_PING_FOR_CONNECT)
                continue;

            if(!Child.CountChildConnect)
                Child.CountChildConnect=0;
            if(!Child.Stage)
                Child.Stage=0;
            if(Child.CountChildConnect>=MAX_CONNECT_CHILD)
                continue;

            if(!this.IsCanConnect(Child) || Child.Hot)
                continue;

            var LevelNum=this.AddrLevelNode(Child);
            var stat=Levels[LevelNum];
            if(!stat)
            {
                stat={Prioritet:0,arr:[]};
            }
            Levels[LevelNum]=stat;
            stat.arr.push(Child);


            //var Prioritet=10*Child.Stage+Child.CountChildConnect;
            //var Prioritet=1000000000*(200-(100*Child.Stage+Child.CountChildConnect))+Child.BlockProcessCount;
            // var Prioritet=Child.BlockProcessCount;
            // if(!stat.Node || Prioritet > stat.Prioritet)
            // {
            //     stat.Node=Child;
            //     stat.Prioritet=Prioritet;
            // }

        }


        for(var n=0;n<Levels.length;n++)
        {
            var Stat=Levels[n];
            if(Stat)
            {
                Stat.arr.sort(SortNodeBlockProcessCount);
                Stat.Node=Stat.arr[0];
            }
        }

        return Levels;
    }



    AddLevelConnect(Node)
    {
        if(this.LoadHistoryMode || !global.CAN_START)
            return;


        //отсоедняем все дочерние узлы, имеющие более одного соединения
        var Level=this.AddrLevelNode(Node);

        this.CheckDisconnectChilds(Level);


        if(Node.Hot)
            return;

        Node.Hot=true;

        var arr=this.LevelNodes[Level];
        if(!arr)
        {
            arr=[];
            this.LevelNodes[Level]=arr;
        }
        arr.push(Node);

        //this.LevelNodesCount=this.GetNodesLevelCount();


        this.SendGetMessage(Node);

        ADD_TO_STAT("NETCONFIGURATION");

        ADD_TO_STAT("AddLevelConnect");
        //ToLog("Add Level connect: "+Level+"  "+NodeName(Node));
    }

    //КРИТЕРИИ НОРМАЛЬНОСТИ СВЯЗЕЙ:
    CheckDisconnectChilds(Level)
    {
        //отсоединяем все дочерние узлы, имеющие более MIN_CONNECT_CHILD соединения
        var bWas=0;
        var arr=this.LevelNodes[Level];
        if(arr)
        {
            var ChildCount=arr.length;
            for(var n=0;n<arr.length;n++)
            {
                var Node=arr[n];
                if(ChildCount>MIN_CONNECT_CHILD && Node.LevelCount>MIN_CONNECT_CHILD)
                {
                    {
                        ChildCount--;
                        Node.Hot=false;
                        this.DeleteNodeFromHot(Node);
                        ADD_TO_STAT("DisconnectChild");
                        this.StartDisconnectHot(Node,"CheckDisconnectChilds");
                        bWas=1;
                        continue;
                    }
                }
            }
        }
        return bWas;
    }

    FindPair(L)
    {
        //пока не исп-ся
        for(let n=0;n<this.NodesArr.length;n++)
        {
            let Node=this.NodesArr[n];
            if(Node.addrStr===this.addrStr)
                continue;

            if(Node.CountDeltaTime<=2)
                continue;
            if(Node.DeltaTime<=MAX_PING_FOR_CONNECT)
                continue;

            var Level=this.AddrLevelNode(Node);
            if(Level!==L)
                continue;

            // if(!Node.LevelNodes)
            //     continue;
            // var arr=Node.LevelNodes[Level];
            // if(arr && arr.length>=MAX_CONNECT_CHILD)
            //     continue;
            if(Node.LevelCount>=MIN_CONNECT_CHILD)
                continue;



                var arr_len;
            if(!arr)
                arr_len=0;
            else
                arr_len=arr.length;

            if(arr_len===0)
            {
                this.StartAddLevelConnect(Node);
                return true;
            }



            for(var i=0;i<arr_len;i++)
            {
                var Node2=arr[i];
                if(Node2.addrStr===this.addrStr)
                    continue;
                if(!Node2.LevelNodes)
                    continue;

                var arr2=Node2.LevelNodes[Level];
                if(arr2 && arr2.length>1)
                {
                    this.StartAddLevelConnect(Node);
                    return true;
                }
            }
        }
        return false;
    }



    //TIME TIME TIME
    GetHotTimeNodes()
    {
        if(this.LoadHistoryMode || !global.CAN_START)
            return this.GetActualNodes();
        else
            return this.GetHotNodes();
    }

    CorrectTime()
    {

        var ArrNodes=this.GetHotTimeNodes();
        var CountNodes=ArrNodes.length;
        var DeltaArr=[];
        var NodesSet = new Set();
        for(var i=0;i<ArrNodes.length;i++)
        {
            var Node=ArrNodes[i];
            if(!Node.Times)
                continue;
            if(Node.Times.Count<2)
                continue;

            if(this.PerioadAfterCanStart>=PERIOD_FOR_START_CHECK_TIME)
                if(Node.Times.Count<5)
                    continue;

            NodesSet.add(Node);
        }

        for(var Node of NodesSet)
        {
            DeltaArr.push(Node.Times.AvgDelta);
        }


        if(DeltaArr.length<1)
            return;
        if(DeltaArr.length<CountNodes/2)
            return;
        if(this.PerioadAfterCanStart>=PERIOD_FOR_START_CHECK_TIME)
        {
            if(DeltaArr.length<3*CountNodes/4)
                return;
        }


        DeltaArr.sort(function (a,b) {return a-b});


        //Calc mediana avg
        var start,finish;
        if(Math.floor(DeltaArr.length/2)===DeltaArr.length/2)
        {
            start=DeltaArr.length/2-1;
            finish=start+1;
        }
        else
        {
            start=Math.floor(DeltaArr.length/2);
            finish=start;
        }

        var Sum=0;
        var Count=0;
        for(var i=start;i<=finish;i++)
        {
            Sum=Sum+DeltaArr[i];
            Count++;
        }

        var AvgDelta=Math.floor(Sum/Count+0.5);


        if(this.PerioadAfterCanStart<PERIOD_FOR_START_CHECK_TIME)
        {
            var KT=(PERIOD_FOR_START_CHECK_TIME-this.PerioadAfterCanStart)/PERIOD_FOR_START_CHECK_TIME;
            //ToLog("AvgDelta="+AvgDelta+ " KT="+KT);
            AvgDelta=AvgDelta*KT;
        }
        else
        {
            MAX_TIME_CORRECT=25;
        }

        if(AvgDelta < (-MAX_TIME_CORRECT))
            AvgDelta=-MAX_TIME_CORRECT;
        else
        if(AvgDelta > MAX_TIME_CORRECT)
            AvgDelta=MAX_TIME_CORRECT;



        if(Math.abs(AvgDelta)<15)
        {
            return;
        }
        //ToLog("Correct time: Delta="+AvgDelta+"  DELTA_CURRENT_TIME="+DELTA_CURRENT_TIME);
        if(AvgDelta>0)
            ADD_TO_STAT("CORRECT_TIME_UP")
        else
            ADD_TO_STAT("CORRECT_TIME_DOWN")

        global.DELTA_CURRENT_TIME += AvgDelta;


        //reset times
        this.ClearTimeStat();

        SAVE_CONST();
    }
    ClearTimeStat()
    {
        var ArrNodes=this.GetHotTimeNodes();
        for(var Node of ArrNodes)
        {
            Node.Times=undefined;
        }
    }


    TimeDevCorrect()
    {
        if(CHECK_DELTA_TIME.bUse)
        {
            var BlockNum=GetCurrentBlockNumByTime();
            if(CHECK_DELTA_TIME.StartBlockNum<=BlockNum && CHECK_DELTA_TIME.EndBlockNum>BlockNum)
            {
                if(!global.DELTA_CURRENT_TIME)
                    global.DELTA_CURRENT_TIME=0;
                var CorrectTime=0;
                if(CHECK_DELTA_TIME.bAddTime)
                    CorrectTime = CHECK_DELTA_TIME.DeltaTime;
                else
                    CorrectTime = -CHECK_DELTA_TIME.DeltaTime;

                //ToLog("***USE CORRECT TIME: "+CHECK_DELTA_TIME.Num+" Delta = "+CorrectTime+" ***");

                global.DELTA_CURRENT_TIME += CorrectTime;
                //reset times
                this.ClearTimeStat();
                SAVE_CONST(true);
            }
        }
    }

    //ACTIVE LIST

    SetNodePrioritet(Node,Prioritet)
    {
        if(Node.Prioritet===Prioritet)
            return;

        if(Node.addrArr)
        {
            var Item=this.ActualNodes.find(Node);
            if(Item)
            {
                this.ActualNodes.remove(Node);
                Node.Prioritet=Prioritet;
                this.ActualNodes.insert(Node);
            }
        }
        Node.Prioritet=Prioritet;
    }


    AddNodeToActive(Node)
    {

        if(Node.addrArr)
        {
            if(CompareArr(Node.addrArr,this.addrArr)===0)
            {
                return;
            }

            this.CheckNodeMap(Node);


            this.ActualNodes.insert(Node);
        }

        Node.ResetNode();
        Node.Active=true;
        Node.Stage=0;
        Node.NextConnectDelta=1000;

        if(!Node.FirstTime)
        {
            Node.FirstTime=GetCurrentTime()-0;
            Node.FirstTimeStr=""+GetTimeStr();
        }

        ADD_TO_STAT("AddToActive");
        //ToLog("AddNodeToActive: "+Node.addrStr)

    }


    DeleteNodeFromActive(Node)
    {
        if(!Node.Stage)
            Node.Stage=0;
        Node.Stage++;
        Node.Active=false;
        if(Node.Hot)
            this.DeleteNodeFromHot(Node);
        Node.Hot=false;

        // if(!Node.addrArr)
        //     throw "DeleteNodeFromActive !Node.addrArr"

        this.ActualNodes.remove(Node);

        //ToLogTrace("DeleteNodeFromActive");

        //Node.CloseNode();
        CloseSocket(Node.Socket,"DeleteNodeFromActive");
        CloseSocket(Node.Socket2,"DeleteNodeFromActive");
        Node.ResetNode();
    }



    StartReconnect()
    {
        //переподсоединяемся к серверам раз в час
        //TODO
        return;


        var arr=this.GetActualNodes();
        for(var i=0;i<arr.length;i++)
        {
            var Node=arr[i];
            if(Node.Socket && Node.Socket.ConnectToServer)
            {
                if(!Node.SocketStart)
                    Node.SocketStart=(new Date)-0;
                var DeltaTime=(new Date)-Node.SocketStart;
                if(DeltaTime>=PERIOD_FOR_RECONNECT)
                {
                    if(random(100)>=90)
                        Node.CreateReconnection();
                }
            }
        }
    }


    IsLocalIP(addr)
    {
        //192.168.0.0 - 192.168.255.255
        //10.0.0.0 - 10.255.255.255
        //100.64.0.0 - 100.127.255.255
        //172.16.0.0 - 172.31.255.255
        if(addr.substr(0,7)==="192.168" || addr.substr(0,3)==="10.")
            return 1;
        else
            return 0;
    }

    GetActualsServerIP(bFlag)
    {
        var arr=this.GetActualNodes();
        var Str="";
        arr.sort(function (a,b)
        {
            if(a.ip>b.ip)
                return -1;
            else
            if(a.ip<b.ip)
                return 1;
            else
            return 0;
        });

        if(bFlag)
            return arr;

        for(var i=0;i<arr.length;i++)
        {
            Str+=arr[i].ip+", ";
        }
        return Str.substr(0,Str.length-2);
    }




    //Levels lib
    AddrLevelNode(Node)
    {
        if(Node.GrayConnect)
            return MAX_LEVEL_SPECIALIZATION-1;//TODO с учетом номера серого соединения

        return AddrLevelArr(this.addrArr,Node.addrArr);
    }

    GetNodesLevelCount()
    {
        var Count=0;
        for(var i=0;i<this.LevelNodes.length;i++)
        {
            var arr=this.LevelNodes[i];
            for(var n=0;arr && n<arr.length;n++)
                if(arr[n].Hot)
                {
                    Count++;
                    break;
                }
        }
        return Count;
    }

    GetHotNodes()
    {
        var ArrNodes=[];
        for(var L=0;L<this.LevelNodes.length;L++)
        {
            var arr=this.LevelNodes[L];
            for(let j=0;arr && j<arr.length;j++)
            {
                ArrNodes.push(arr[j])
            }
        }
        return ArrNodes;
    }


    DeleteNodeFromHot(Node)
    {
        if(!Node.Stage)
            Node.Stage=0;
        if(Node.Hot)
        {
            Node.Stage++;
            Node.Hot=false;
        }


        Node.CanHot=false;
        for(var i=0;i<this.LevelNodes.length;i++)
        {
            var arr=this.LevelNodes[i];
            for(var n=0;arr && n<arr.length;n++)
                if(arr[n]===Node)
                {
                    //ToLog("Del Level connect: "+i+"  "+NodeName(Node));

                    ADD_TO_STAT("DeleteLevelConnect");
                    arr.splice(n,1);
                    ADD_TO_STAT("NETCONFIGURATION");

                    break;
                }
        }
    }

    DeleteAllNodesFromHot(Str)
    {
        for(var i=0;i<this.LevelNodes.length;i++)
        {
            var arr=this.LevelNodes[i];
            for(var n=0;arr && n<arr.length;n++)
            {
                var Node=arr[n];
                if(Node.Hot)
                {
                    ADD_TO_STAT("DeleteAllNodesFromHot");
                    this.DeleteNodeFromHot(Node);
                    this.StartDisconnectHot(Node,Str);
                }
            }
        }
    }



    //Other lib
    ValueToXOR(StrType,Str)
    {
        var Arr1=toUTF8Array(Str);
        var Arr2=shaarr(this.CommonKey+":"+this.addrStr+":"+StrType);
        return WALLET.XORHash(Arr1,Arr2);
    }
    ValueFromXOR(Node,StrType,Arr1)
    {
        var Arr2=shaarr(this.CommonKey+":"+Node.addrStr+":"+StrType);
        var Arr=WALLET.XORHash(Arr1,Arr2);
        var Str=Utf8ArrayToStr(Arr);
        return Str;
    }
}


function SortNodeBlockProcessCount(a,b)
{
    if(b.BlockProcessCount!==a.BlockProcessCount)
       return b.BlockProcessCount-a.BlockProcessCount;

    return a.DeltaTime-b.DeltaTime;
}
global.SortNodeBlockProcessCount=SortNodeBlockProcessCount;


/*
TODO:
Сортировать NodesArr каждые 5 сек после получения пинга
*/

