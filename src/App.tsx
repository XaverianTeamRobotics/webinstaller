import React from 'react';
import { useState } from 'react';
import './App.css';
import { Adb, ADB_SYNC_MAX_PACKET_SIZE, AdbPacketData, AdbPacketInit } from '@yume-chan/adb';
import { AdbWebUsbBackend, AdbWebUsbBackendStream } from '@yume-chan/adb-backend-webusb';
import { WrapReadableStream, ReadableStreamWrapper, ChunkStream, InspectStream, pipeFrom, ReadableStream, WritableStream } from '@yume-chan/stream-extra';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { action } from "mobx";

const CredentialStore = new AdbWebCredentialStore();

var webUSB: AdbWebUsbBackend | undefined = undefined
var stream: AdbWebUsbBackendStream | undefined = undefined
var device: Adb | undefined = undefined

async function connectAdbDevice(): Promise<AdbWebUsbBackend | undefined> {
  console.log("connectAdbDevice called");
  (document.getElementById("connectionStatus") as HTMLElement).innerHTML = "Connecting...";
  await AdbWebUsbBackend.requestDevice().then((output) => {
    if (output !== undefined) {
      console.log("User connected device");
      webUSB = output;;
      (document.getElementById("connectionStatus") as HTMLElement).innerHTML = "Connected to " + output.name;
    } else {
      console.log("User pressed cancel or undefined was returned")
      webUSB = undefined;
      stream = undefined;
      (document.getElementById("connectionStatus") as HTMLElement).innerHTML = "No device connected";
    }
    return webUSB
  })
  console.log(webUSB)
  return webUSB;
}

async function doUpload(): Promise<Boolean | undefined> {
  try {
    console.log(stream);
    let readable: ReadableStream<AdbPacketData>;
    let writable: WritableStream<AdbPacketInit>;
    if (stream === undefined) {
      stream = await webUSB!.connect();
    }

    // Use `InspectStream`s to intercept and log packets
    readable = stream.readable
        .pipeThrough(
            new InspectStream(packet => {
                console.log('in ' + packet);
            })
        );

    writable = pipeFrom(
        stream.writable,
        new InspectStream((packet: AdbPacketInit) => {
          console.log('out ' + packet);
        })
    );
    
    if (device === undefined) {
      console.log(device)
      device = await Adb.authenticate(
        { readable, writable },
        CredentialStore,
        undefined
      );
    }

    await fetch('./bin/TeamCode-debug.apk')
      .then(res => res.blob()) // Gets the response and returns it as a blob
      .then(blob => {
        console.log(blob)
        var file = new File([blob], "./bin/TeamCode-debug.apk")
        uploadFile(file);
      });
    return true;
  } catch(e) {alert("An error occured. Please see the console to see the exact error."); console.error(e)}
}
/*
enum Stage {
  Ready,

  Uploading,

  Installing,

  Completed,
}

interface Progress {
  filename: string;

  stage: Stage;

  uploadedSize: number;

  totalSize: number;

  value: number | undefined;
}
*/
async function uploadFile(file: File) {
  /*
  var progress = {
    filename: file.name,
    stage: Stage.Uploading,
    uploadedSize: 0,
    totalSize: file.size,
    value: 0,
  };
  */
  await createFileStream(file)
    .pipeThrough(new ChunkStream(ADB_SYNC_MAX_PACKET_SIZE))
    .pipeThrough(new ProgressStream(action((uploaded) => {
      /*
      if (uploaded !== file.size) {
        progress = {
          filename: file.name,
          stage: Stage.Uploading,
          uploadedSize: uploaded,
          totalSize: file.size,
          value: uploaded / file.size * 0.8,
        };
      } else {
        progress = {
            filename: file.name,
            stage: Stage.Installing,
            uploadedSize: uploaded,
            totalSize: file.size,
            value: 0.8,
        };
      }
      */
    })))
    .pipeTo(device!.install());
    /*
    progress = {
      filename: file.name,
      stage: Stage.Completed,
      uploadedSize: file.size,
      totalSize: file.size,
      value: 1,
    };
    */
}

function createFileStream(file: File) {
  return new WrapReadableStream<Uint8Array>(file.stream() as unknown as ReadableStreamWrapper<Uint8Array>);
}

class ProgressStream extends InspectStream<Uint8Array> {
  public constructor(onProgress: (value: number) => void) {
      let progress = 0;
      super(chunk => {
          progress += chunk.byteLength;
          onProgress(progress);
      });
  }
}

export default function App() {
  const [webUSBBackend, setWebUSBBackend] = useState(webUSB)
  const [status, setStatus] = useState("Not Connected")
  return (
    <div className="App">
      <header className="App-header">
        <p>
          Web Installer by Xaverian Team Robotics
        </p>
      </header>
      <div className="rowC">
        <h1 id="connectionStatus">
            No device connected
        </h1>
        <button onClick={() => {connectAdbDevice().then((out) => { setWebUSBBackend(out) }); setStatus("Ready")}}>
            Connect to device
        </button>
      </div>
      <div className='rowC'>
        <p> Upload Status: </p>
        <p style={{"fontWeight":"bold"}}>{status}</p>
      </div>
      { 
        (webUSBBackend !== undefined)
          ? <div> <button onClick={() => {setStatus("Uploading"); doUpload().then((out) => {setStatus("Done")})}}> Start Upload </button> </div>
          : <div> <h2> Connect a device to start upload </h2> </div>
      }
    </div>
  );
}
