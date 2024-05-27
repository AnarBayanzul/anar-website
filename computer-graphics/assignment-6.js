"use strict";
var gl;
var canvas;

var printDay;

var mvMatrix;

// non-common modelview matrix
var nonCommonMVMatrix;

// common modelview matrix
var commonMVMatrix;

var a_positionLoc;
var u_colorLoc;
var u_mvMatrixLoc;

// Last time that this function was called
var g_last = Date.now();
var elapsed = 0;
var mspf = 1000/30.0;  // ms per frame

// scale factors
var rSunMult = 45;      // keep sun's size manageable
var rPlanetMult = 2000;  // scale planet sizes to be more visible
var orMoonMult = 50; // Scale moon orbit

// surface radii (km)
var rSun = 696000;
var rMercury = 2440;
var rVenus = 6052;
var rEarth = 6371;
var rMoon = 1737;

// orbital radii (km)
var orMercury = 57909050;
var orVenus = 108208000;
var orEarth = 149598261;
var orMoon = 384399;

// orbital periods (Earth days)
var pMercury = 88;
var pVenus = 225;
var pEarth = 365;
var pMoon = 27;

// time
var currentDay;
var daysPerFrame;

var globalScale;

// vertices
var circleVertexPositionData = []; // for orbit
var sphereVertexPositionData = []; // for planet
var sphereVertexIndexData = []; // for planet

var circleVertexPositionBuffer;
var sphereVertexPositionBuffer;
var sphereVertexIndexBuffer;


// for trackball
var m_inc;
var m_curquat;
var m_mousex = 1;
var m_mousey = 1;
var trackballMove = false;

// for lighting
var normalsArray = [];
var sphereVertexNormalBuffer;
var nMatrix, u_nMatrixLoc;

var lightColor;
var lightPosition = vec4(1.0, 1.0, 1.0, 1.0);
var lightAmbient = vec4(0.4, 0.4, 0.4, 1.0 );
var lightDiffuse = vec4( 1.0, 1.0, 1.0, 1.0 );
var lightSpecular = vec4( 1.0, 1.0, 1.0, 1.0 );

var materialAmbient, ambientProductLoc;
var materialDiffuse, diffuseProductLoc;
var materialSpecular, specularProductLoc;
var materialShininess = 100.0;

// for texturing
var a_TextureCoordLoc;
var u_TextureSamplerLoc;
var textureCoordData = [];
var earthTexture;
var mercuryTexture;
var moonTexture;
var sunTexture;
var venusTexture;
var planetVertexTextureCoordBuffer;

function handleLoadedTexture(texture) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
}

function initTexture() {
    earthTexture = gl.createTexture();
    earthTexture.image = new Image();
    earthTexture.image.onload = function () {
        handleLoadedTexture(earthTexture)
    }
    earthTexture.image.src = "earth.jpg";

    mercuryTexture = gl.createTexture();
    mercuryTexture.image = new Image();
    mercuryTexture.image.onload = function () {
        handleLoadedTexture(mercuryTexture)
    }
    mercuryTexture.image.src = "mercury.jpg";

    moonTexture = gl.createTexture();
    moonTexture.image = new Image();
    moonTexture.image.onload = function () {
        handleLoadedTexture(moonTexture)
    }
    moonTexture.image.src = "moon.jpg";

    sunTexture = gl.createTexture();
    sunTexture.image = new Image();
    sunTexture.image.onload = function () {
        handleLoadedTexture(sunTexture)
    }
    sunTexture.image.src = "sun.jpg";

    venusTexture = gl.createTexture();
    venusTexture.image = new Image();
    venusTexture.image.onload = function () {
        handleLoadedTexture(venusTexture)
    }
    venusTexture.image.src = "venus.jpg";
}
function initBuffers() {
    var latitudeBands = 50;
    var longitudeBands = 50;
    var radius = 2;

    for (var latNumber=0; latNumber <= latitudeBands; latNumber++) {
        var theta = latNumber * Math.PI / latitudeBands;
        var sinTheta = Math.sin(theta);
        var cosTheta = Math.cos(theta);

        for (var longNumber=0; longNumber <= longitudeBands; longNumber++) {
            var u = 1 - (longNumber / longitudeBands);
            var v = 1 - (latNumber / latitudeBands);
            textureCoordData.push(u);
            textureCoordData.push(v);
        }
    }
    planetVertexTextureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, planetVertexTextureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordData), gl.STATIC_DRAW);
}


// for trackball
function mouseMotion(x, y) {
        var lastquat;
        if (m_mousex != x || m_mousey != y)
        {
            lastquat = trackball(
                  (2.0 * m_mousex - canvas.width) / canvas.width,
                  (canvas.height - 2.0 * m_mousey) / canvas.height,
                  (2.0 * x - canvas.width) / canvas.width,
                  (canvas.height - 2.0 * y) / canvas.height);
            m_curquat = add_quats(lastquat, m_curquat);
            m_mousex = x;
            m_mousey = y;
        }
}

window.onload = function init() {
    canvas = document.getElementById( "gl-canvas" );
    printDay = document.getElementById("printDay");

    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }

    //
    //  Configure WebGL
    //
    gl.viewport( 0, 0, canvas.width, canvas.height );
    gl.clearColor( 0.85, 0.85, 0.85, 1.0 );

    gl.enable(gl.DEPTH_TEST);

    currentDay = 0;
    daysPerFrame = 0.0625;

    // global scaling for the entire orrery
    globalScale = 50.0 / ( orEarth + orMoon + ( rEarth + 2 * rMoon ) * rPlanetMult );

    setupCircle();

    setupSphere();

    //  Load shaders and initialize attribute buffers

    var program = initShaders( gl, "vertex-shader", "fragment-shader" );
    gl.useProgram( program );

    // Load the data into the GPU

    circleVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer( gl.ARRAY_BUFFER, circleVertexPositionBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(circleVertexPositionData), gl.STATIC_DRAW );

    sphereVertexPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sphereVertexPositionData), gl.STATIC_DRAW);

    sphereVertexIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereVertexIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(sphereVertexIndexData), gl.STATIC_DRAW);
    
    // Send sphere vertex normal data
    sphereVertexNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexNormalBuffer);
    //gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normalsArray), gl.STATIC_DRAW);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normalsArray), gl.STATIC_DRAW);


    var a_vNormalLoc = gl.getAttribLocation( program, "a_vNormal" );
    gl.vertexAttribPointer( a_vNormalLoc, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( a_vNormalLoc);

    // Lighting
    ambientProductLoc = gl.getUniformLocation(program, "u_ambientProduct");
    diffuseProductLoc = gl.getUniformLocation(program, "u_diffuseProduct");
    specularProductLoc =  gl.getUniformLocation(program, "u_specularProduct");

     gl.uniform4fv( gl.getUniformLocation(program,
        "u_lightPosition"),flatten(lightPosition) );
     gl.uniform1f( gl.getUniformLocation(program,
        "u_shininess"),materialShininess );








    // Texture Stuff
    // vertex texture coordinates
    a_TextureCoordLoc = gl.getAttribLocation(program, "a_TextureCoord");
    gl.enableVertexAttribArray(a_TextureCoordLoc);

    gl.activeTexture(gl.TEXTURE0);
    u_TextureSamplerLoc = gl.getUniformLocation(program, "u_TextureSampler");
    gl.uniform1i(u_TextureSamplerLoc, 0);




    gl.bindBuffer(gl.ARRAY_BUFFER, planetVertexTextureCoordBuffer);
    gl.vertexAttribPointer(a_TextureCoordLoc, 2, gl.FLOAT, false, 0, 0)






    // Associate out shader variables with our data buffer

    a_positionLoc = gl.getAttribLocation( program, "a_position" );

    u_colorLoc = gl.getUniformLocation( program, "u_color" );

    u_mvMatrixLoc = gl.getUniformLocation( program, "u_mvMatrix" );

    // projection matrix
    var u_projMatrixLoc = gl.getUniformLocation( program, "u_projMatrix" );
    var projMatrix = perspective(40, 1.5, 0.1, 1000.0);
    gl.uniformMatrix4fv(u_projMatrixLoc, false, flatten(projMatrix) );

    // Normal matrix
    u_nMatrixLoc = gl.getUniformLocation(program, "u_Matrix");


    // for trackball
    m_curquat = trackball(0, 0, 0, 0);

    // for trackball
    canvas.addEventListener("mousedown", function(event){
        m_mousex = event.clientX - event.target.getBoundingClientRect().left;
        m_mousey = event.clientY - event.target.getBoundingClientRect().top;
        trackballMove = true;
    });

    // for trackball
    canvas.addEventListener("mouseup", function(event){
        trackballMove = false;
    });

    // for trackball
    canvas.addEventListener("mousemove", function(event){
      if (trackballMove) {
        var x = event.clientX - event.target.getBoundingClientRect().left;
        var y = event.clientY - event.target.getBoundingClientRect().top;
        mouseMotion(x, y);
      }
    } );


    // Button listeners for days per frame
    var incDPF = document.getElementById("incdpf");
    var decDPF = document.getElementById("decdpf");
    incDPF.addEventListener("click", function() {daysPerFrame *= 2;});
    decDPF.addEventListener("click", function() {daysPerFrame *= 0.5;});


    render();
};

function setupCircle() {
    var increment = 0.1;
    for (var theta=0.0; theta < Math.PI*2; theta+=increment) {
        circleVertexPositionData.push(vec3(Math.cos(theta+increment), 0.0, Math.sin(theta+increment)));
    }
}

function setupSphere() {
    // Texture stuff
    initBuffers();
    initTexture();

    var latitudeBands = 50;
    var longitudeBands = 50;
    var radius = 1.0;

    // compute sampled vertex positions
    for (var latNumber=0; latNumber <= latitudeBands; latNumber++) {
        var theta = latNumber * Math.PI / latitudeBands;
        var sinTheta = Math.sin(theta);
        var cosTheta = Math.cos(theta);

        for (var longNumber=0; longNumber <= longitudeBands; longNumber++) {
            var phi = longNumber * 2 * Math.PI / longitudeBands;
            var sinPhi = Math.sin(phi);
            var cosPhi = Math.cos(phi);

            var x = cosPhi * sinTheta;
            var y = cosTheta;
            var z = sinPhi * sinTheta;

            sphereVertexPositionData.push(radius * x);
            sphereVertexPositionData.push(radius * y);
            sphereVertexPositionData.push(radius * z);
            normalsArray.push(vec4(x, y, z, 0.0));
        }
    }

    // create the actual mesh, each quad is represented by two triangles
    for (var latNumber=0; latNumber < latitudeBands; latNumber++) {
        for (var longNumber=0; longNumber < longitudeBands; longNumber++) {
            var first = (latNumber * (longitudeBands + 1)) + longNumber;
            var second = first + longitudeBands + 1;
            // the three vertices of the 1st triangle
            sphereVertexIndexData.push(first);
            sphereVertexIndexData.push(second);
            sphereVertexIndexData.push(first + 1);
            // the three vertices of the 2nd triangle
            sphereVertexIndexData.push(second);
            sphereVertexIndexData.push(second + 1);
            sphereVertexIndexData.push(first + 1);
        }
    }
}

function drawCircle(color) {
    // set uniforms
    gl.uniform3fv( u_colorLoc, color );
    mvMatrix = mult(commonMVMatrix, nonCommonMVMatrix);
    gl.uniformMatrix4fv(u_mvMatrixLoc, false, flatten(mvMatrix) );

    gl.enableVertexAttribArray( a_positionLoc );
    gl.bindBuffer(gl.ARRAY_BUFFER, circleVertexPositionBuffer);
    gl.vertexAttribPointer( a_positionLoc, 3, gl.FLOAT, false, 0, 0 );
    gl.drawArrays( gl.LINE_LOOP, 0, circleVertexPositionData.length );
}

function drawSphere(color, texture) {
    // set uniforms
    gl.uniform3fv( u_colorLoc, color );
    mvMatrix = mult(commonMVMatrix, nonCommonMVMatrix);
    gl.uniformMatrix4fv(u_mvMatrixLoc, false, flatten(mvMatrix) );
    // Lighting
    nMatrix = normalMatrix(mvMatrix, true);
    gl.uniformMatrix3fv(u_nMatrixLoc, false, flatten(nMatrix));


    // Lighting
    var materialDiffuse = vec4(1.0, 1.0, 1.0, 1.0)
    var materialAmbient = vec4( 1.0, 1.0, 1.0, 1.0 );
    var materialSpecular = vec4( 1.0, 1.0, 1.0, 1.0 );



    var ambientProduct = mult(lightAmbient, materialAmbient);
    var diffuseProduct = mult(lightDiffuse, materialDiffuse);
    var specularProduct = mult(lightSpecular, materialSpecular);

    gl.uniform4fv(ambientProductLoc, flatten(ambientProduct) );
    gl.uniform4fv(diffuseProductLoc, flatten(diffuseProduct) );
    gl.uniform4fv(specularProductLoc, flatten(specularProduct) );

    // Texture
    gl.bindTexture(gl.TEXTURE_2D, texture);










    gl.enableVertexAttribArray( a_positionLoc );
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereVertexPositionBuffer);
    gl.vertexAttribPointer(a_positionLoc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereVertexIndexBuffer);
    gl.drawElements(gl.TRIANGLES, sphereVertexIndexData.length, gl.UNSIGNED_SHORT, 0);
}

function drawOrbits() {
    // No Lighting
    gl.uniform4fv(ambientProductLoc,flatten(vec4(1.0, 1.0, 1.0, 1.0)) );
    gl.uniform4fv(diffuseProductLoc,flatten(vec4(0.0, 0.0, 0.0, 1.0)) );
    gl.uniform4fv(specularProductLoc,flatten(vec4(0.0, 0.0, 0.0, 1.0)) );


    var gray = vec3( 0.2, 0.2, 0.2 );
    var angleOffset = currentDay * 360.0;  // days * degrees

    // Mercury
    nonCommonMVMatrix = scalem(orMercury, orMercury, orMercury);
    drawCircle(gray);

    // Venus
    nonCommonMVMatrix = scalem(orVenus, orVenus, orVenus);
    drawCircle(gray);

    // Earth
    nonCommonMVMatrix = scalem(orEarth, orEarth, orEarth);
    drawCircle(gray);



    // Moon orbit
    nonCommonMVMatrix = mult(rotateY(angleOffset/pEarth),
                              mult(translate(orEarth, 0.0, 0.0),
                              mult(rotateZ(23.5), scalem(orMoon * orMoonMult, orMoon * orMoonMult, orMoon * orMoonMult))));
    drawCircle(vec3(0.2, 0.2, 0.2));
}

function drawBodies() {
    var size;
    var angleOffset = currentDay * 360.0;  // days * degrees

    // Sun
    size = rSun * rSunMult;
    nonCommonMVMatrix = scalem(size, size, size);
    drawSphere( vec3( 1.0, 1.0, 0.0 ), sunTexture);

    // Mercury
    size = rMercury * rPlanetMult;
    nonCommonMVMatrix = mult(rotateY(angleOffset/pMercury),
                              mult(translate(orMercury, 0.0, 0.0),
                              mult(scalem(size, size, size), rotateY(-angleOffset/pMercury))));
    drawSphere( vec3( 1.0, 0.5, 0.5 ), mercuryTexture);

    // Venus
    size = rVenus * rPlanetMult;
    nonCommonMVMatrix = mult(rotateY(angleOffset/pVenus),
                              mult(translate(orVenus, 0.0, 0.0),
                              mult(scalem(size, size, size), rotateY(-angleOffset/pVenus))));
    drawSphere( vec3( 0.5, 1.0, 0.5 ), venusTexture);

    // Earth
    size = rEarth * rPlanetMult;
    nonCommonMVMatrix = mult(rotateY(angleOffset/pEarth),
                              mult(translate(orEarth, 0.0, 0.0),
                              mult(rotateY(-angleOffset/pEarth),
                              mult(rotateZ(23.5),
                              mult(scalem(size, size, size), rotateY(angleOffset))))));
    drawSphere( vec3( 0.5, 0.5, 1.0 ), earthTexture);

    // Moon
    size = rMoon * rPlanetMult;
    nonCommonMVMatrix = mult(rotateY(angleOffset/pEarth),
                              mult(translate(orEarth, 0.0, 0.0),
                              mult(rotateZ(23.5),
                              mult(rotateY(angleOffset/pMoon),
                              mult(translate(orMoon * orMoonMult, 0.0, 0.0),
                              mult(scalem(size, size, size), rotateY(-angleOffset/pMoon - angleOffset/pEarth)))))));

    drawSphere( vec3( 1.0, 1.0, 1.0 ), moonTexture);
}

function drawDay() {
    if (document.getElementById("dayon").checked == true) { // check if day radio button is on
        var string = 'Day ' + currentDay.toString();
    } else {
        var string = '';
    }
    printDay.innerHTML = string;
}

function drawAll() {
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

    // all planets and orbits will take the following transformation


    
    // global scaling
    commonMVMatrix = scalem(globalScale, globalScale, globalScale);

    // Rotate 15 degrees to make everything visible
    commonMVMatrix = mult(rotateX(20), commonMVMatrix);

    // viewing matrix
    commonMVMatrix = mult(lookAt(vec3(0.0, 0.0, 100.0),
                                  vec3(0.0, 0.0, 0.0),
                                  vec3(0.0, 1.0, 0.0)),
                           commonMVMatrix);


    
    // for trackball
    m_inc = build_rotmatrix(m_curquat);
    commonMVMatrix = mult(commonMVMatrix, m_inc);

    // Light Color
    lightColor = vec4(document.getElementById("rValue").value / 100, document.getElementById("gValue").value / 100, document.getElementById("bValue").value / 100, 1.0);
    lightDiffuse = lightColor;
    lightSpecular = lightColor;
    
    if (document.getElementById("orbon").checked == true)
        drawOrbits();

    drawBodies();
    drawDay();
}

var render = function() {
    // Calculate the elapsed time
    var now = Date.now(); // time in ms
    elapsed += now - g_last;
    g_last = now;
    if (elapsed >= mspf) {
        if (document.getElementById("animon").checked == true) { // Check if animation button is on
            currentDay += daysPerFrame;
            elapsed = 0;
        }
    }
    requestAnimFrame(render);
    drawAll();
};
