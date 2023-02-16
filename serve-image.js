const fs = require('fs');
const path = require('path');

const storyboardBeachMap = {
    'ast-001a': 'mls_hsm_storyboard_beach_water_1_v001.jpeg',
    'ast-001b': 'mls_hsm_storyboard_beach_svenbreach_2_v001.jpeg',
    'ast-001c': 'mls_hsm_storyboard_beach_shipsink_3_v001.jpeg',
    'ast-001d': 'mls_hsm_storyboard_beach_svenfindbeach_4_v001.jpeg',
    'ast-001e': 'mls_hsm_storyboard_beach_beachsurvey_5_v001.jpeg',
    'astsc/8bb0yQX3cgN4AvaKRw8Yi': 'mls_hsm_storyboard_beach_water_1_v001.jpeg',
    'astsc/JizmeOWC_hDYhF_PVb5GN': 'mls_hsm_storyboard_beach_svenbreach_2_v001.jpeg',
    'astsc/qnvsR-6Gh7PCGBrqFUYDd': 'mls_hsm_storyboard_beach_shipsink_3_v001.jpeg',
    'astsc/BOxjsvVtgkgbHysfz600C': 'mls_hsm_storyboard_beach_svenfindbeach_4_v001.jpeg',
    'astsc/oYRAnyt0BAiyfkPqCtJtZ': 'mls_hsm_storyboard_beach_beachsurvey_5_v001.jpeg',
    'astsc/UMB10xYbaf47RFtttY8rr': 'mls_hsm_storyboard_beach_svenswim_6_v001.jpeg',
    'astsc/BU9dtmxyb3f9kg7N-uyqV': 'mls_hsm_storyboard_beach_svenemerge_7_v001.jpeg',
    'astsc/DtUp_B8B_2DAV4nOPD9Hs': 'mls_hsm_storyboard_beach_svencommunicator_8_v001.jpeg',
    'astsc/2vu3qc0f45CcqZdUOJ2si': 'mls_hsm_storyboard_beach_svencallhome_9_v001.jpeg',
    'astsc/TjA4CkxmwLt01nF3-9CuG': 'mls_hsm_storyboard_beach_svenfrustrated_10_v001.jpeg',
    'astsc/6ePBbU3kB0lbOs_T5rO3N': 'mls_hsm_storyboard_beach_svenhearnoise_11_v001.jpeg',
    'astsc/ZtFOEIqAH-hnExttsuMIT': 'mls_hsm_storyboard_beach_svenscared_12_v001.jpeg',
    'astsc/mbdyjj8H5lvDJt4ShhL4s': 'mls_hsm_storyboard_beach_svenseetrilobot_13_v001.jpeg',
    'astsc/vP5cILzZl2dY1hokFbpnw': 'mls_hsm_storyboard_beach_trilobothover_14_v001.jpeg',
    'astsc/aDyqSdbAq9WJ0ojmIbDR9': 'mls_hsm_storyboard_beach_svenhorror_15_v001.jpeg',
    'astsc/b5DjQvDPdMMGkKrz_Z_uv': 'mls_hsm_storyboard_beach_rockblast_16_v001.jpeg',
    'astsc/EfHvJseMwec4EpGwoKnST': 'mls_hsm_storyboard_beach_svenrockcover_17_v001.jpeg',
    'astsc/lVqVtyT7PfFIwjz1aGNkx': 'mls_hsm_storyboard_beach_svencover_18_v001.jpeg',
    'astsc/hRSsaQYO1gd3iHIuNDg0K': 'mls_hsm_storyboard_beach_svenbolt_19_v001.jpeg',
    'astsc/2QfjoxEENz4vbSvfDMLRa': 'mls_hsm_storyboard_beach_jungle_20_v001.jpeg',
    'astsc/iH_VgD0dUYNOvb7xVSGqK': 'mls_hsm_storyboard_beach_jungledash_21_v001.jpeg',
    'astsc/GeL51Jbncr6ehJVEB-Odl': 'mls_hsm_storyboard_beach_trilobotblast_22_v001.jpeg',
    'astsc/MmdHTfCc63Lz1JnwDlTdR': 'mls_hsm_storyboard_beach_jungleentrance_23_v001.jpeg',
    'astsc/t4JRzj_NvA1IeWOAwGQiJ': 'mls_hsm_storyboard_fall_Svenface_1_v001.jpeg',
    'astsc/_ERbpZ-wkWWXXtn9QUpQM': 'mls_hsm_storyboard_fall_directhit_2_v001.jpeg',
    'astsc/c16UKQ2zxCaw_A6rA7AXg': 'mls_hsm_storyboard_fall_Svenworry_3_v001.jpeg',
    'astsc/lTtWuJLHBXc0w8v1X8pX2': 'mls_hsm_storyboard_fall_shipsmoke_4_v001.jpeg',
    'astsc/mqUti-ZjM0WF-rihVtjyw': 'mls_hsm_storyboard_fall_groundapproaching_5_v001.jpeg',
    'astsc/N8ax67kK1PwN3nAD_mXOv': 'mls_hsm_storyboard_fall_Svenstruggle_7_v001.jpeg',
    'astsc/NcpnyzOONuqFNCAn1r3jB': 'mls_hsm_storyboard_fall_shipcloud_8_v001.jpeg',
    'astsc/04JEVLzJfwQDf2qOLOBkH': 'mls_hsm_storyboard_fall_Svencrashface_9_v001.jpeg',
    'astsc/oOykSUUMDfMnkhJMZMkJK': 'mls_hsm_storyboard_fall_Sveneject_11_v001.jpeg',
    'astsc/bq_dJ_aDCp-kZPmPrSgoB': 'mls_hsm_storyboard_fall_ejectbutton_12_v001.jpeg',
    'astsc/wApk8PP-ZJdFluJiZs_gG': 'mls_hsm_storyboard_fall_Sveneject_13_v001.jpeg',
    'astsc/4qM-nxEsp6oC5DXPtr6hj': 'mls_hsm_storyboard_fall_sveneject_14_v001.jpeg',
    'astsc/exG_lPqh8HGgwmVAL43OD': 'mls_hsm_storyboard_fall_shipapproach_15_v001.jpeg',
    'astsc/jFBWYJoXI_aLjr4jsdlzl': 'mls_hsm_storyboard_fall_impact_16_v001.jpeg',
    'astsc/s6fVS4-NmG8Tg31ukgeyi': 'mls_hsm_storyboard_fall_Svenfly_18_v001.jpeg',
    'astsc/jzriGwQzkXfWGZ7UPBcS_': 'mls_hsm_storyboard_fall_Svenimpact_19_v001.jpeg',
    'astsc/Mnr7Ip5VTFJOa0v04Y1L7': 'mls_hsm_storyboard_fall_svensink_20_v001.jpeg',
    'astsc/zWeZSxiNSfOa0tavtknb7': 'mls_hsm_storyboard_fall_svensurface_21_v001.jpeg',
    'astsc/AVF652gBw7UxcrJpZ62QU': 'mls_hsm_storyboard_plateau_svenjungleclear_2_v001.jpeg',
    'astsc/OJg19pD7mCa_lkkwXgU0S': 'mls_hsm_storyboard_plateau_svencliff_3_v001.jpeg',
    'astsc/h_S6FDPEni4MFBuhr_C55': 'mls_hsm_storyboard_plateau_svenedge_4_v001.jpeg',
    'astsc/CFdKJkXShsMxXGVFPqiVQ': 'mls_hsm_storyboard_plateau_city_5_v001.jpeg',
    'astsc/0y4h5FFTYoDbVXvE-QQaQ': 'mls_hsm_storyboard_plateau_callhome_7_v001.jpeg',
    'astsc/Qyq9BRFBlA2a5GXgbXv4u': 'mls_hsm_storyboard_plateau_startscreen_8_v001.jpeg',
    'astsc/Mr10j3fTGMF6pPKaIxUzG': 'mls_hsm_storyboard_junglerun_blasters_2_v001.jpeg',
    'astsc/E5x8bQVzCLvIqQcUtWwep': 'mls_hsm_storyboard_junglerun_svenflip_3_v001.jpeg',
    'astsc/c6BC5GQLNZxU3yyAOL4ax': 'mls_hsm_storyboard_junglerun_svenfall_4_v001.jpeg',
    'astsc/JTJrSfOWBVX6Hhbx-M3XN': 'mls_hsm_storyboard_junglerun_svenfruit_5_v001.jpeg',
    'astsc/w3wW9McdJSvT_broDNXO_': 'mls_hsm_storyboard_junglerun_trilobotclose_6_v001.jpeg',
    'astsc/g7Q8FaKgevuLmY9-CxN5H': 'mls_hsm_storyboard_junglerun_svenfireback_7_v001.jpeg',
    'astsc/uv3jTQFcCfqSr8NUXliU8': 'mls_hsm_storyboard_junglerun_firewild_8_v001.jpeg',
    'astsc/541flgxhcrGnTnBa4jVHs': 'mls_hsm_storyboard_junglerun_svenopening_9_v001.jpeg',
    'astsc/05dOdScTuEViJ68mr1wyB': 'mls_hsm_storyboard_junglerun_sventrees_11_v001.jpeg',
    'astsc/5cYegEOKha8q0QCJr0FTf': 'mls_hsm_storyboard_junglerun_svenlaststand_12_v001.jpeg',
    'astsc/9lEM_pFgbIdepifJeyVTm': 'mls_hsm_storyboard_junglerun_treehit_13_v001.jpeg',
    'astsc/EkW5GmAnpTi0Ybk9r_T9P': 'mls_hsm_storyboard_junglerun_trilobotcrunch_14_v001.jpeg',
    'astsc/AsWE_LVmQQiFYNB2Fr4Kv': 'mls_hsm_storyboard_junglerun_treefall_15_v001.jpeg',
    'astsc/p5r220J0UhyIw2XZWw9MI': 'mls_hsm_storyboard_junglerun_trilobotexplode_16_v001.jpeg',
    'astsc/6QiaYVPovZdOKm6bAJNLU': 'mls_hsm_storyboard_junglerun_svenshocked_18_v001.jpeg',
    'astsc/ofMBzrcoFrkQgucEMYyZD': 'mls_hsm_storyboard_junglerun_citynoise_19_v001.jpeg',
    'astsc/wSo_GP6uF1TIFvJKw66P6': 'mls_hsm_storyboard_satellite_establish_1_v001.jpeg',
    'astsc/9OfUNlzPGmjpk7c5XgTq_': 'mls_hsm_storyboard_satellite_Sven_2_v001.jpeg',
    'astsc/q_flH9GdwQ5w0ZVzfgcXf': 'mls_hsm_storyboard_satellite_tools_3_v001.jpeg',
    'astsc/RrHiatMFJ5ZtUCSP4mJAe': 'mls_hsm_storyboard_satellite_workwide_4_v001.jpeg',
    'astsc/WLF5oaSd3ETh4ORA-_7Zq': 'mls_hsm_storyboard_satellite_planet_5_v001.jpeg',
    'astsc/TX9_1wR5wz56CbLs4_rIh': 'mls_hsm_storyboard_satellite_facework_6_v001.jpeg',
    'astsc/pu9Y--OdS0TXZaGz6DYi1': 'mls_hsm_storyboard_satellite_welder_7_v001.jpeg',
    'astsc/_HeDAxw8gtOphQQL8NJYf': 'mls_hsm_storyboard_satellite_weld_8_v001.jpeg',
    'astsc/wv7Df8AWVBe0CWkVmbl1L': 'mls_hsm_storyboard_satellite_powerup_9_v001.jpeg',
    'astsc/epWDZ6BXpH_Bbhsc4kc0P': 'mls_hsm_storyboard_satellite_success_14_v001.jpeg',
    'astsc/17UtisA2m7DVk_sfM1GYC': 'mls_hsm_storyboard_satellite_triloboteye_15_v001.jpeg',
    'astsc/dPcl1zTJHrX2jNzPmtOyt': 'mls_hsm_storyboard_satellite_trilobotrise_16_v001.jpeg',
    'astsc/oWZ-TJ2wMdRaOJO5_IyuB': 'mls_hsm_storyboard_satellite_svendeflect_17_v001.jpeg',
    'astsc/7KehFS589vco6padE1Z--': 'mls_hsm_storyboard_satellite_svenflee_19_v001.jpeg',
    'astsc/Kt_PP-RIpUjX6qLCtOdJG': 'mls_hsm_storyboard_satellite_svenship_21_v001.jpeg',
    'astsc/UGul3Akm0rCo2vI0xJ8IG': 'mls_hsm_storyboard_satellite_triloboteye_22_v001.jpeg',
    'astsc/YTkNaxbAkkYPGDS_vhnJ-': 'mls_hsm_storyboard_satellite_svenfullthrottle_23_v001.jpeg',
    'astsc/QKjtOULJluUakjilAGB2W': 'mls_hsm_storyboard_satellite_engineready_24_v001.jpeg',
    'astsc/GcrHRnADNt4ESpG1guKRm': 'mls_hsm_storyboard_satellite_ship blastoff_25_v001.jpeg',
    'astsc/oZ4VQMDVCfNqHZVQX-P8h': 'mls_hsm_storyboard_title_forest_1_v001.PNG',
    'astsc/Zh3iFMq39KbTa1ypf2y-e': 'mls_hsm_storyboard_title_graphic_2_v001.jpeg',
    'astsc/UO3UJbF12mibarOjprQgi': 'mls_hsm_storyboard_title_blast_3_v001.PNG',
    'astsc/MfeJnxkJaszErmn6wKG07': 'mls-hsm_character_art_sven_vbelt_v002.jpg',
    'astsc/DxGAj1Y9REBYYW6aSX8WT': 'mls-hsm_character_art_sven_vconcept_v003.png',
    'astsc/luZXEqDfZJjdJY3aXNSzC': 'mls-hsm_character_art_sven_vconcept_v006.jpg',
    'astsc/2g0egvOF0eIj3_7zEbe5G': 'mls-hsm_character_art_sven_vconcept_v006.psd',
    'astsc/DGufHv43zQ-F1-FuAzn0g': 'mls-hsm_character_art_sven_vconcept_v007.jpg',
    'astsc/z6A4MKrYwdhUer0XgO1Q6': 'mls-hsm_character_art_sven_vconcept_v008.jpg',
    'astsc/eb0TdfsRJ1YOY1teA_tgD': 'mls-hsm_character_art_sven_vconcept_v008.png',
    'astsc/vKrlrBqGUBno8L4U5gwpL': 'mls-hsm_character_art_sven_vexpressions_v005.jpg',
    'astsc/QzltsLCOhWvrGAqLziEkN': 'mls-hsm_character_art_sven_vhead_v002.png',
    'astsc/Z_lfnk7MfJEyxuB4vZfrC': 'mls-hsm_character_art_sven_vhelmet_v004.jpg',
    'astsc/eYJU2TZdKQeYe7Coe7JXT': 'mls-hsm_character_art_sven_vhelmet_v006.jpg',
    'astsc/YhoE5ESI4HT7nngBkFpRB': 'mls-hsm_character_art_sven_vnogear_v002.jpg',
    'astsc/nzd06EVHdZv4zu8ZBXKZK': 'mls-hsm_character_art_sven_vnogear_v006.jpg',
    'astsc/2NKAkMsthh8XNaum0Iat1': 'mls-hsm_character_art_sven_vold_v003.jpg',
    'astsc/oRbBajqTA3Gs8KwZ3K-FH': 'mls-hsm_character_art_sven_vold_v004.jpg',
    'astsc/Z_nMoIDf_jk9Ua9y8v2Y_': 'mls-hsm_character_art_sven_vsculpt_v004.jpg',
    'astsc/roqIgtMlY6gfpKK8kYhS0': 'mls-hsm_character_art_sven_vsmall_v002.jpg',
    'astsc/xpcLjvD2K4sVQRTmyhRWe': 'mls-hsm_character_art_sven_vtitle_v002.png',
};

const rootPath = 'asset'; // Root directory of assets

async function serveImage(req, res) {
    const { body } = req;
    const assetId = body.object.replace('asset:', '');
    console.log(assetId);
    console.log(storyboardBeachMap[assetId]);
    const filePath = path.join(__dirname, rootPath, storyboardBeachMap[assetId]);

    const mimeType = path.extname(filePath); // extract the extension from the filepath

    // load various image types
    let contentType;
    switch (mimeType) {
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
            contentType = 'image/jpg';
            break;
        case '.jpeg':
            contentType = 'image/jpeg';
            break;
        default:
            contentType = 'text/html';
    }

    try {
        const base64Encode = `data:${contentType};base64,${fs.readFileSync(filePath, 'base64')}`;
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(base64Encode, 'utf8');
    } catch (err) {
        console.log(err);
        res.status(500)
            .send(err);
    }
}

module.exports = {
    serveImage,
};
