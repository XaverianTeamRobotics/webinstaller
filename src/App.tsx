import React, { Component } from 'react';
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

async function connectAdbDevice() {
  console.log("connectAdbDevice called");
  (document.getElementById("connectionStatus") as HTMLElement).innerHTML = "Connecting...";
  AdbWebUsbBackend.requestDevice().then(async (output) => {
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
    console.log(webUSB)
  })
}

async function doUpload() {
  let readable: ReadableStream<AdbPacketData>;
      let writable: WritableStream<AdbPacketInit>;
      stream = await webUSB!.connect();

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

      device = await Adb.authenticate(
        { readable, writable },
        CredentialStore,
        undefined
      );

      fetch('/TeamCode-debug.apk')
        .then(res => res.blob()) // Gets the response and returns it as a blob
        .then(blob => {
          var file = new File([blob], "./bin/TeamCode-debug.apk")
          uploadFile(file);
        });
}

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

var progress: Progress = {
  filename: "",
  stage: Stage.Ready,
  uploadedSize: 0,
  totalSize: 0,
  value: 0,
}

async function uploadFile(file: File) {
  progress = {
    filename: file.name,
    stage: Stage.Uploading,
    uploadedSize: 0,
    totalSize: file.size,
    value: 0,
  };
  createFileStream(file)
    .pipeThrough(new ChunkStream(ADB_SYNC_MAX_PACKET_SIZE))
    .pipeThrough(new ProgressStream(action((uploaded) => {
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
    })))
    .pipeTo(device!.install());
    
    progress = {
      filename: file.name,
      stage: Stage.Completed,
      uploadedSize: file.size,
      totalSize: file.size,
      value: 1,
    };
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

export default class App extends Component {
  handleUpdate() {
    this.forceUpdate()
    console.log("Updated UI")
  }

  render() {
    const uploadStatus = progress
    const webUSBBackend = webUSB
    var uploadStage: String
    switch (uploadStatus.stage) {
      case Stage.Ready:
        uploadStage = "Ready";
        break;
      case Stage.Uploading:
        uploadStage = "Uploading";
        break;
      case Stage.Installing:
        uploadStage = "Installing";
        break;
      case Stage.Completed:
        uploadStage = "Completed";
        break;
    }
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
          <button onClick={() => {connectAdbDevice(); this.handleUpdate()}}>
              Connect to device
          </button>
        </div>
        <div className='rowC'>
          <div>
            Upload Status: <p style={{"fontWeight":"bold"}}>{uploadStage}</p>
          </div>
          <div>
            Upload Progress: <p style={{"fontWeight":"bold"}}>{(uploadStatus.value ?? 0) * 100 }%</p>
          </div>
        </div>
        {(webUSBBackend !== undefined) 
          ? <div> <button onClick={doUpload}> Start Upload </button> </div>
          : <div> <h2> Connect a device to start upload </h2> </div>
        }
      </div>
    );
  }
}